"use client";

import { Extension, type Editor } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { Node as EditorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { Button } from "@/components/ui/button";
import {
  MentionPicker,
  optionId,
  useMentionPeople,
  type MentionCandidate,
  type MentionPerson,
} from "@/components/app/chat/mentions";
import { EVERYONE, findMentionTokens, mentionQueryAt } from "@/lib/mentions";
import { isImageFile } from "@/lib/images";
import type { Id } from "@convex/_generated/dataModel";
import { chatEditorExtensions } from "@/lib/chat-editor-format";

const PICKER_ID = "chat-rich-mention-picker";
const markdownByDocument = new WeakMap<EditorNode, string>();

/** Immutable editor documents let validation and persistence share serialization. */
function documentMarkdown(editor: Editor, document = editor.state.doc): string {
  const existing = markdownByDocument.get(document);
  if (existing !== undefined) return existing;
  const markdown =
    editor.markdown?.serialize(document.toJSON()) ?? document.textContent;
  markdownByDocument.set(document, markdown);
  return markdown;
}
export type RichMessageInputHandle = { focus: () => void };
type Mention = { start: number; end: number; query: string };

export function RichMessageInput({
  ref,
  value,
  onChange,
  onSubmit,
  onEscape,
  onFiles,
  onLimit,
  disabled,
  placeholder,
  label,
  interim,
  conversationId,
  kind,
  peer,
  authors,
  me,
  canMentionEveryone,
  onKnownPeople,
}: {
  ref: Ref<RichMessageInputHandle>;
  value: string;
  onChange: (markdown: string) => void;
  onSubmit: () => void;
  onEscape?: () => void;
  onFiles: (files: File[]) => void;
  onLimit: (notice: string) => void;
  disabled: boolean;
  placeholder: string;
  label: string;
  interim: string;
  conversationId: Id<"conversations">;
  kind: "global" | "announcements" | "admins" | "dm" | "group" | null;
  peer: MentionPerson | null;
  authors: MentionPerson[];
  me: string | null | undefined;
  canMentionEveryone: boolean;
  onKnownPeople: (people: ReadonlyMap<string, MentionPerson>) => void;
}) {
  const [mention, setMention] = useState<Mention | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const picking =
    !disabled &&
    kind !== "dm" &&
    mention !== null &&
    mention.start !== dismissed;
  const people = useMentionPeople({
    conversationId,
    kind,
    peer,
    authors,
    me,
    canMentionEveryone,
    open: picking,
    query: mention?.query ?? "",
  });
  const highlighted = Math.min(
    active,
    Math.max(0, people.candidates.length - 1),
  );
  const known = useRef(people.known);
  useEffect(() => {
    known.current = people.known;
    onKnownPeople(people.known);
  }, [people.known, onKnownPeople]);

  const extensions = useMemo(
    () => [
      ...chatEditorExtensions(),
      // ProseMirror invokes decorations after mount; this does not read the ref during render.
      // eslint-disable-next-line react-hooks/refs
      Extension.create({
        name: "chatDraftRules",
        addProseMirrorPlugins() {
          const editor = this.editor;
          return [
            new Plugin({
              filterTransaction(transaction) {
                if (!transaction.docChanged) return true;
                const markdown = documentMarkdown(editor, transaction.doc);
                if (markdown.length <= 2000) return true;
                onLimit("That is too long for one message.");
                return false;
              },
              props: {
                decorations(state) {
                  if (kind === "dm") return null;
                  const decorations: Decoration[] = [];
                  state.doc.descendants((node, position, parent) => {
                    if (
                      !node.isText ||
                      !node.text ||
                      parent?.type.name === "codeBlock" ||
                      node.marks.some((mark) => mark.type.name === "code")
                    )
                      return;
                    for (const token of findMentionTokens(node.text)) {
                      if (
                        known.current.has(token.handle) ||
                        (token.handle === EVERYONE &&
                          kind === "global" &&
                          canMentionEveryone)
                      )
                        decorations.push(
                          Decoration.inline(
                            position + token.start,
                            position + token.end,
                            { class: "mention-chip" },
                          ),
                        );
                    }
                  });
                  return DecorationSet.create(state.doc, decorations);
                },
              },
            }),
          ];
        },
      }),
    ],
    [kind, canMentionEveryone, onLimit],
  );

  function updateMention(current: Editor) {
    const { selection } = current.state;
    if (
      !selection.empty ||
      current.isActive("code") ||
      current.isActive("codeBlock")
    ) {
      setMention(null);
      return;
    }
    const text = selection.$from.parent.textBetween(
      0,
      selection.$from.parent.content.size,
      undefined,
      "\n",
    );
    const query = mentionQueryAt(text, selection.$from.parentOffset);
    setMention(
      query === null
        ? null
        : {
            start: selection.$from.start() + query.start,
            end: selection.from,
            query: query.query,
          },
    );
  }

  function pick(candidate: MentionCandidate) {
    if (!editor || !mention) return;
    const handle =
      candidate.kind === "everyone" ? EVERYONE : candidate.person.handle;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: mention.start, to: mention.end },
        { type: "text", text: `@${handle} ` },
      )
      .run();
    setMention(null);
    setDismissed(null);
    setActive(0);
  }

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    content: value,
    contentType: "markdown",
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        "aria-autocomplete": "list",
        "aria-disabled": String(disabled),
        "aria-controls": picking ? PICKER_ID : "",
        "aria-activedescendant":
          picking && people.candidates.length
            ? optionId(PICKER_ID, highlighted)
            : "",
        class:
          "min-h-9 max-h-48 overflow-y-auto py-1.5 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap outline-none [&_p]:min-h-[1.5em] [&_p]:m-0 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:rounded [&_code]:bg-foreground/[0.07] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.875em] [&_pre]:my-1 [&_pre]:rounded-lg [&_pre]:bg-foreground/[0.07] [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
      },
      handleKeyDown(view, event) {
        if (event.isComposing || view.composing) return false;
        if (picking && mention) {
          if (event.key === "Escape") {
            setDismissed(mention.start);
            event.preventDefault();
            return true;
          }
          if (people.candidates.length) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              setActive(
                (highlighted +
                  (event.key === "ArrowDown"
                    ? 1
                    : people.candidates.length - 1)) %
                  people.candidates.length,
              );
              event.preventDefault();
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              pick(people.candidates[highlighted]);
              event.preventDefault();
              return true;
            }
          }
        }
        if (event.key === "Escape" && onEscape) {
          onEscape();
          return true;
        }
        if (event.key !== "Enter") return false;
        if (event.shiftKey) {
          if (editor?.isActive("listItem")) {
            editor.commands.splitListItem("listItem");
            return true;
          }
          return false;
        }
        event.preventDefault();
        onSubmit();
        return true;
      },
      handlePaste(_view, event) {
        const files = [...(event.clipboardData?.files ?? [])].filter(
          isImageFile,
        );
        if (!files.length) return false;
        event.preventDefault();
        onFiles(files);
        return true;
      },
    },
    onUpdate({ editor: current }) {
      onChange(documentMarkdown(current));
      updateMention(current);
    },
    onSelectionUpdate({ editor: current }) {
      updateMention(current);
    },
    onBlur() {
      setMention(null);
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed || documentMarkdown(editor) === value)
      return;
    editor.commands.setContent(value, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        editor?.commands.focus("end");
      },
    }),
    [editor],
  );
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      empty: current?.isEmpty ?? true,
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      bullet: current?.isActive("bulletList") ?? false,
      ordered: current?.isActive("orderedList") ?? false,
      code: current?.isActive("code") ?? false,
      block: current?.isActive("codeBlock") ?? false,
    }),
  });

  return (
    <div className="relative min-w-0 flex-1">
      {state?.empty ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 py-1.5 text-[0.9375rem] leading-relaxed text-faint dark:text-muted-foreground"
        >
          {placeholder}
        </div>
      ) : null}
      <EditorContent editor={editor} className="min-h-9" />
      {interim ? (
        <p aria-live="polite" className="pb-1 text-sm text-muted-foreground">
          {interim}
        </p>
      ) : null}
      {picking ? (
        <MentionPicker
          id={PICKER_ID}
          candidates={people.candidates}
          active={highlighted}
          loading={people.loading}
          query={mention?.query ?? ""}
          onActiveChange={setActive}
          onPick={pick}
        />
      ) : null}
      {editor ? (
        <BubbleMenu
          editor={editor}
          updateDelay={50}
          appendTo={() => document.body}
          options={{
            placement: "top",
            offset: 8,
            shift: { padding: 8 },
            flip: true,
          }}
          shouldShow={({ editor: current, state: currentState }) =>
            current.isEditable &&
            current.isFocused &&
            !currentState.selection.empty &&
            currentState.doc
              .textBetween(
                currentState.selection.from,
                currentState.selection.to,
              )
              .trim().length > 0
          }
          className="z-[100] flex max-w-[calc(100vw-1rem)] items-center gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-lg"
          role="toolbar"
          aria-label="Format selected text"
        >
          <Button
            variant="ghost"
            size="sm"
            aria-label="Bold"
            aria-pressed={state?.bold}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className="aria-pressed:bg-muted"
          >
            <strong>B</strong>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Italic"
            aria-pressed={state?.italic}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className="aria-pressed:bg-muted"
          >
            <em>I</em>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Bulleted list"
            aria-pressed={state?.bullet}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className="aria-pressed:bg-muted"
          >
            • List
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Numbered list"
            aria-pressed={state?.ordered}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className="aria-pressed:bg-muted"
          >
            1. List
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Inline code"
            aria-pressed={state?.code}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleCode().run()}
            className="aria-pressed:bg-muted"
          >
            <code>&lt;/&gt;</code>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Code block"
            aria-pressed={state?.block}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className="aria-pressed:bg-muted"
          >
            <code>{"{ }"}</code>
          </Button>
        </BubbleMenu>
      ) : null}
    </div>
  );
}
