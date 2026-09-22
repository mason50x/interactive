"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
  ArrowUpIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
  PencilSquareIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { ChartBarIcon, MicrophoneIcon } from "@heroicons/react/24/solid";
import { useQuery } from "convex/react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import type { MentionPerson } from "@/components/app/chat/mentions";
import { AttachmentTray } from "@/components/app/chat/thread/attachment-tray";
import { BotQuota } from "@/components/app/chat/thread/bot-quota";
import {
  RichMessageInput,
  type RichMessageInputHandle,
} from "@/components/app/chat/thread/rich-message-input";
import {
  PollComposer,
  pollDraftError,
} from "@/components/app/chat/thread/poll-composer";
import { replyFromMessage } from "@/components/app/chat/thread/reply-preview";
import { useAttachments } from "@/components/app/chat/thread/use-attachments";
import { useTypingBeat } from "@/components/app/chat/typing";
import { Waveform } from "@/components/app/chat/waveform";
import { personName, refusalMessage, type Refusal } from "@/lib/chat";
import { useChatDraft, type ChatPollDraft } from "@/lib/chat-drafts";
import { trimChatMarkdownForSend } from "@/lib/chat-editor-format";
import { MAX_IMAGES_PER_MESSAGE } from "@/lib/images";
import { EVERYONE, findMentionTokens } from "@/lib/mentions";
import { useDictation } from "@/lib/use-dictation";
import { cn } from "@/lib/utils";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type {
  ChatImage,
  ChatMention,
  ChatMessage,
} from "@convex/chat/messages";

/** Rich editing, saved drafts, attachments, polls and dictation for one conversation. */
/** The Markdown payload cap, enforced by the server as well as the rich editor. */
const MAX_BODY = 2000;

/**
 * A spoken segment after whatever is already in the box. A space between
 * unless the box is empty or already ends in one, so dictating after typing
 * does not weld the two words together.
 */
function joinSpoken(prev: string, next: string) {
  return prev === "" || /\s$/.test(prev) ? prev + next : `${prev} ${next}`;
}

/** What the thread may ask of the composer. See `composer` in `Thread`. */
export type ComposerHandle = {
  addFiles: (files: File[]) => void;
  focus: () => void;
  /** Returns false when a draft already exists, so recovering a send never replaces it. */
  restoreDraft: (
    text: string,
    reply?: ChatMessage | null,
    poll?: ChatPollDraft,
    images?: ChatImage[],
  ) => boolean;
};

export function Composer({
  ref,
  onSubmit,
  pictures,
  replyingTo,
  onCancelReply,
  conversationId,
  kind,
  peer,
  authors,
  me,
  canMentionEveryone = false,
  editing = null,
  onCancelEdit,
  onEdit,
  onRestoreReply,
}: {
  ref: Ref<ComposerHandle>;
  onSubmit: (
    text: string,
    attachmentIds: Id<"attachments">[],
    previews: ChatImage[],
    replyTo: ChatMessage | null,
    mentions: ChatMention[],
    everyone: boolean,
    poll?: ChatPollDraft,
  ) => Promise<Refusal | null>;
  /**
   * Whether pictures are on for this deployment. Polls remain available
   * through the plus menu when uploads are disabled.
   */
  pictures: boolean;
  replyingTo: ChatMessage | null;
  onCancelReply: () => void;
  /** For the mention picker. See `useMentionPeople`. */
  conversationId: Id<"conversations">;
  kind: "global" | "announcements" | "dm" | "group" | null;
  peer: MentionPerson | null;
  authors: MentionPerson[];
  me: string | null | undefined;
  /** Staff in the Everyone room. The one place `@everyone` is offered. */
  canMentionEveryone?: boolean;
  editing?: ChatMessage | null;
  onCancelEdit?: () => void;
  onEdit?: (messageId: Id<"messages">, body: string) => Promise<Refusal | null>;
  onRestoreReply?: (reply: ChatMessage) => void;
}) {
  const { draft, updateDraft } = useChatDraft(me, conversationId);
  const [editState, setEditState] = useState<{
    id: string;
    body: string;
  } | null>(null);
  if (editing !== null && editing._id !== editState?.id) {
    setEditState({ id: editing._id, body: editing.body });
  } else if (editing === null && editState !== null) {
    setEditState(null);
  }
  const body =
    editing === null ? draft.body : (editState?.body ?? editing.body);
  function setBody(value: string | ((previous: string) => string)) {
    if (editing !== null) {
      setEditState((previous) => ({
        id: editing._id,
        body:
          typeof value === "function"
            ? value(previous?.body ?? editing.body)
            : value,
      }));
    } else {
      updateDraft((previous) => ({
        ...previous,
        body: typeof value === "function" ? value(previous.body) : value,
      }));
    }
  }
  const reply = editing === null ? (replyingTo ?? draft.reply) : null;
  const poll = editing === null ? draft.poll : null;
  const [notice, setNotice] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [sending, setSending] = useState(false);

  // Tells everybody else there are words in here.
  useTypingBeat(conversationId, body, true);

  // The `@bot` allowance, for the plus menu. Subscribed here rather than in
  // the popup so the bar is already right the moment the menu opens, instead
  // of arriving a beat after it.
  const quota = useQuery(api.chat.bot.quota, pictures ? {} : "skip");

  // Finals append to whatever is there, through an updater, so a keystroke
  // and a spoken segment both land in arrival order and neither overwrites
  // the other. The interim guess is shown after the text and never stored.
  const dictation = useDictation({
    onFinal: (segment) =>
      setBody((prev) => joinSpoken(prev, segment).slice(0, MAX_BODY)),
    onError: setNotice,
  });
  const live = dictation.state !== "idle";
  const shown =
    dictation.interim === ""
      ? body
      : joinSpoken(body, dictation.interim).slice(0, MAX_BODY);

  const inputRef = useRef<RichMessageInputHandle>(null);
  const knownPeople = useRef<ReadonlyMap<string, MentionPerson>>(new Map());
  const rememberPeople = useCallback(
    (people: ReadonlyMap<string, MentionPerson>) => {
      knownPeople.current = people;
    },
    [],
  );

  useEffect(() => {
    if (replyingTo !== null || editing !== null) inputRef.current?.focus();
  }, [replyingTo, editing]);

  useEffect(() => {
    if (replyingTo !== null && draft.reply?._id !== replyingTo._id) {
      updateDraft((previous) => ({ ...previous, reply: replyingTo }));
    }
  }, [replyingTo, draft.reply?._id, updateDraft]);

  const tray = useAttachments({
    pictures: pictures && editing === null && poll === null,
    onNotice: setNotice,
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const previousAttachmentCount = useRef(0);
  useEffect(() => {
    const count = tray.attached.length;
    if (count > 0 || previousAttachmentCount.current > 0) {
      updateDraft((previous) => ({ ...previous, hadAttachments: count > 0 }));
    }
    previousAttachmentCount.current = count;
  }, [tray.attached.length, updateDraft]);

  function cancelReply() {
    updateDraft((previous) => ({ ...previous, reply: null }));
    onCancelReply();
  }

  function restoreDraft(
    text: string,
    restoredReply: ChatMessage | null = null,
    restoredPoll?: ChatPollDraft,
    restoredImages: ChatImage[] = [],
  ) {
    if (
      draft.body !== "" ||
      draft.poll !== null ||
      draft.reply !== null ||
      replyingTo !== null ||
      tray.attached.length > 0 ||
      editing !== null
    ) {
      setNotice(
        "Send or clear your current draft before restoring this message.",
      );
      return false;
    }
    if (restoredImages.length > 0 && !pictures) {
      setNotice("Pictures are not available in this conversation.");
      return false;
    }
    if (restoredImages.length > 0)
      tray.restore(
        restoredImages.map((image) => ({
          key: crypto.randomUUID(),
          preview: image.url,
          width: image.width,
          height: image.height,
          state: "ready",
          attachmentId: image.attachmentId,
        })),
      );
    updateDraft((previous) => ({
      ...previous,
      body: text,
      reply: restoredReply,
      poll: restoredPoll ?? null,
    }));
    if (restoredReply !== null) onRestoreReply?.(restoredReply);
    inputRef.current?.focus();
    return true;
  }

  useImperativeHandle(ref, () => ({
    addFiles: tray.addFiles,
    focus: () => inputRef.current?.focus(),
    restoreDraft,
  }));

  const canSend =
    !sending &&
    !savingEdit &&
    !tray.waiting &&
    (trimChatMarkdownForSend(shown) !== "" ||
      (editing === null && tray.ready.length > 0)) &&
    (editing === null || trimChatMarkdownForSend(shown) !== editing.body) &&
    (poll === null ||
      (trimChatMarkdownForSend(shown) !== "" && pollDraftError(poll) === null));

  async function submit() {
    if (!canSend) return;
    const text = trimChatMarkdownForSend(shown);
    if (editing !== null) {
      if (onEdit === undefined) return;
      dictation.abort();
      setSavingEdit(true);
      setNotice(null);
      try {
        const refusal = await onEdit(editing._id, text);
        if (refusal === null) onCancelEdit?.();
        else setNotice(refusalMessage(refusal));
      } catch (error) {
        setNotice(
          error instanceof Error &&
            error.message === "This message can no longer be edited."
            ? error.message
            : "Your edit could not be saved. Your changes are still here; try again.",
        );
      } finally {
        setSavingEdit(false);
      }
      return;
    }
    const sending = tray.ready;

    // Keep the captured draft until the thread has safely queued it.
    dictation.abort();
    setSending(true);
    setNotice(null);

    // Who the text names, from the people the picker offered, for the
    // placeholder to draw. The server reads the body and decides for itself.
    // Nothing in a DM: `@words` there are plain text, with no picker behind
    // them, so the placeholder draws them as typed.
    const mentions: ChatMention[] = [];
    let everyone = false;
    if (kind !== "dm") {
      for (const token of findMentionTokens(text)) {
        if (token.handle === EVERYONE) {
          if (kind === "global" && canMentionEveryone) everyone = true;
          continue;
        }
        const person = knownPeople.current.get(token.handle);
        if (person === undefined) continue;
        if (mentions.some((entry) => entry.clerkId === person.clerkId))
          continue;
        mentions.push({ clerkId: person.clerkId, handle: person.handle });
      }
    }

    // Every entry in `sending` is `ready`, and `ready` always carries an id —
    // see `Attached`. The filter is for the type, not for a case.
    const proven = sending.flatMap((entry) =>
      entry.attachmentId === undefined
        ? []
        : [{ ...entry, attachmentId: entry.attachmentId }],
    );

    let refusal: Refusal | null;
    try {
      refusal = await onSubmit(
        text,
        proven.map((entry) => entry.attachmentId),
        proven.map((entry) => ({
          attachmentId: entry.attachmentId,
          url: entry.preview,
          width: entry.width,
          height: entry.height,
        })),
        reply,
        mentions,
        everyone,
        poll === null
          ? undefined
          : { options: poll.options.map((option) => option.trim()) },
      );
    } catch {
      setNotice(
        "That message could not be queued. Your draft is still here; try again.",
      );
      setSending(false);
      return;
    }
    setSending(false);

    if (refusal === null) {
      updateDraft((previous) => {
        // A draft edited in another tab while this queue write completed
        // belongs to that writer and must not be erased with this send.
        if (
          previous.body !== body ||
          JSON.stringify(previous.poll) !== JSON.stringify(poll)
        )
          return previous;
        return { body: "", reply: null, poll: null, hadAttachments: false };
      });
      tray.clear();
      onCancelReply();
      // The outbox owns previews until confirmation, retry or explicit discard.
      return;
    }

    setNotice(refusalMessage(refusal));
    if (refusal === "image" || refusal === "too-many-images") {
      // The rows are gone — swept, or discarded from another tab. The
      // pictures have to be added again, so the previews go.
      for (const entry of sending) URL.revokeObjectURL(entry.preview);
      tray.clear();
    }
    inputRef.current?.focus();
  }

  function toggleDictation() {
    setNotice(null);
    if (live) dictation.stop();
    else dictation.start();
  }

  return (
    <div className="px-3 pb-3 sm:px-8 lg:px-14 xl:px-20">
      {/* Refusals, and the few dictation failures worth a sentence.

          For refusals: the category and never the rule. See `refusalMessage`
          in `src/lib/chat.ts` — telling somebody exactly which word tripped is
          telling them how to spell it next time.

          Over the composer rather than under it, so it reads as the message
          coming back rather than as a line of small print. */}
      {notice === null ? null : (
        <div className="flex justify-center pb-2">
          <p
            role="alert"
            className="animate-notice-in max-w-full rounded-full border border-destructive/30 bg-surface px-3.5 py-1.5 text-center text-[0.8125rem] text-destructive shadow-[0_2px_8px_rgba(15,15,15,0.06)]"
          >
            {notice}
          </p>
        </div>
      )}
      {draft.hadAttachments &&
      tray.attached.length === 0 &&
      editing === null ? (
        <div
          role="status"
          className="mb-2 flex items-center justify-center gap-2 text-xs text-muted-foreground"
        >
          Your text draft is saved. Add its pictures again before sending.
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Dismiss picture reminder"
            onClick={() =>
              updateDraft((previous) => ({
                ...previous,
                hadAttachments: false,
              }))
            }
          >
            <XMarkIcon />
          </Button>
        </div>
      ) : null}

      {/* One radius whatever is in it. At a single line the box is fifty
          pixels tall, so a 25px corner *is* the pill; with a tray above or a
          paragraph in it, the same corner is a card. It used to switch
          between `rounded-full` and this, and animating a radius from nine
          thousand pixels to twenty-five is a shape doing something strange
          on the way. */}
      <div className="composer flex flex-col rounded-[25px] border border-border bg-surface shadow-[0_1px_2px_rgba(15,15,15,0.04),0_4px_12px_rgba(15,15,15,0.08),0_12px_28px_-8px_rgba(15,15,15,0.14)] transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[0_1px_2px_rgba(15,15,15,0.04),0_6px_16px_rgba(15,15,15,0.1),0_16px_36px_-8px_rgba(15,15,15,0.18)]">
        {editing !== null ? (
          <div className="mx-3 mt-3 flex items-center gap-2 rounded-2xl bg-primary/[0.06] px-3 py-2 text-sm text-primary">
            <PencilSquareIcon className="size-4" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Editing message</p>
              <p className="text-xs text-muted-foreground">
                Your unsent draft will be here when you finish.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelEdit}
              disabled={savingEdit}
            >
              Cancel
            </Button>
          </div>
        ) : null}
        {reply === null ? null : (
          <div className="mx-3 mt-3 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-3 py-2.5">
            <ArrowUturnLeftIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.75rem] font-semibold text-primary">
                Replying to{" "}
                {personName({
                  handle: reply.authorHandle,
                  displayName: reply.authorName,
                })}
              </p>
              <p className="line-clamp-2 text-[0.8125rem] break-words text-muted-foreground">
                {replyFromMessage(reply).preview}
              </p>
            </div>
            <button
              type="button"
              onClick={cancelReply}
              disabled={sending}
              aria-label="Cancel reply"
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-faint outline-none hover:bg-foreground/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        )}

        {poll !== null ? (
          <PollComposer
            value={poll}
            onChange={(value) =>
              updateDraft((previous) => ({ ...previous, poll: value }))
            }
            onCancel={() =>
              updateDraft((previous) => ({ ...previous, poll: null }))
            }
            disabled={sending}
          />
        ) : null}

        {editing === null ? (
          <AttachmentTray
            attached={tray.attached}
            ghost={tray.ghost}
            onRemove={tray.remove}
            onSettled={tray.settle}
          />
        ) : null}

        <div
          className={cn(
            "flex items-end gap-2 py-1.5 pr-1.5",
            editing === null ? "pl-1.5" : "pl-4",
          )}
        >
          {/* The plus on the left, where every chat puts it. It opens a
              small menu: how many `@bot` tags are left today, then the
              picker. Pasting and dropping reach the same `addFiles`. */}
          {editing === null ? (
            <>
              <PlusMenu
                quota={quota}
                pictures={pictures && poll === null}
                full={tray.attached.length >= MAX_IMAGES_PER_MESSAGE}
                disabled={sending}
                canPoll={poll === null && tray.attached.length === 0}
                onPoll={() => {
                  updateDraft((previous) => ({
                    ...previous,
                    poll: { options: ["", ""] },
                  }));
                  inputRef.current?.focus();
                }}
                onUpload={() => fileInput.current?.click()}
              />
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={tray.onPick}
              />
            </>
          ) : null}

          <RichMessageInput
            ref={inputRef}
            key={editing?._id ?? "draft"}
            value={body}
            onChange={(next) => {
              setBody(next);
              setNotice(null);
            }}
            onSubmit={() => void submit()}
            onEscape={
              editing !== null && !savingEdit ? onCancelEdit : undefined
            }
            onFiles={tray.addFiles}
            onLimit={setNotice}
            disabled={savingEdit || sending || !me}
            placeholder={
              live
                ? "Listening…"
                : poll !== null
                  ? "Ask a question"
                  : tray.attached.length > 0 && editing === null
                    ? "Add a caption, or just send"
                    : "Say something"
            }
            label={
              editing !== null
                ? "Edit message"
                : poll !== null
                  ? "Poll question"
                  : "Message"
            }
            interim={dictation.interim}
            conversationId={conversationId}
            kind={kind}
            peer={peer}
            authors={authors}
            me={me}
            canMentionEveryone={canMentionEveryone}
            onKnownPeople={rememberPeople}
          />
          {/* Absent where the browser has no recogniser (Firefox) and on the
              server, so it appears after hydration without a mismatch. The
              waveform mounts only once the recogniser has actually started,
              which is after the microphone was granted in this same tap. */}
          {dictation.supported ? (
            <Button
              variant="ghost"
              size="icon-lg"
              shape="circle"
              onClick={toggleDictation}
              aria-pressed={live}
              aria-label={live ? "Stop dictation" : "Start dictation"}
              disabled={savingEdit || sending}
              className={cn(
                live
                  ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                  : "text-faint hover:text-foreground dark:text-muted-foreground",
              )}
            >
              {dictation.state === "listening" ? (
                <Waveform />
              ) : (
                // Pulsing while arming or winding down: on, but not yet a signal.
                <MicrophoneIcon
                  className={cn("size-5", live && "animate-pulse")}
                />
              )}
            </Button>
          ) : null}
          <Button
            size="lg"
            shape="circle"
            className="pr-3.5 pl-3"
            onClick={() => void submit()}
            disabled={!canSend}
          >
            {editing !== null ? (
              <CheckIcon className="size-4" />
            ) : (
              <ArrowUpIcon
                strokeWidth={2.5}
                className="size-4 transition-transform duration-200 ease-out group-hover/button:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover/button:translate-y-0"
              />
            )}
            {savingEdit
              ? "Saving…"
              : editing !== null
                ? "Save"
                : sending
                  ? "Sending…"
                  : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The plus on the left of the field, and the small menu it opens.
 *
 * Not `MenuContent`, on purpose. The shared popup surface is right for a
 * menu that hangs off a message; this one comes out of the composer and is
 * dressed as it — the same surface, border, corner and lift, and
 * `.composer-skin` for the dark theme's step up without the composer's blue
 * focus ring, since an open menu holds focus. The shared surface's shadow
 * colour would tint that lift, so the popup is Base UI's own part with the
 * composer's skin on it, and only the rows inside are the shared ones.
 */
function PlusMenu({
  quota,
  pictures,
  full,
  onUpload,
  canPoll,
  onPoll,
  disabled,
}: {
  quota: Parameters<typeof BotQuota>[0]["quota"];
  pictures: boolean;
  /** The tray already holds as many as one message may carry. */
  full: boolean;
  onUpload: () => void;
  canPoll: boolean;
  onPoll: () => void;
  disabled: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label="More"
        disabled={disabled}
        className="group flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-faint transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted data-popup-open:text-foreground dark:text-muted-foreground dark:hover:bg-muted/50 dark:data-popup-open:bg-muted/50"
      >
        {/* A plus that turns into a cross while the menu is open:
            the same glyph, a quarter turn on, is the one that puts
            it away. */}
        <PlusIcon
          strokeWidth={2}
          className="size-5 transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-data-popup-open:rotate-45 motion-reduce:transition-none"
        />
      </MenuTrigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          side="top"
          align="start"
          sideOffset={14}
          className="z-50 outline-none"
        >
          <MenuPrimitive.Popup className="composer-skin popup-slide flex w-[16.5rem] flex-col rounded-[20px] border border-border bg-surface p-1.5 text-foreground shadow-[0_1px_2px_rgba(15,15,15,0.04),0_4px_12px_rgba(15,15,15,0.08),0_12px_28px_-8px_rgba(15,15,15,0.14)] outline-none">
            {pictures ? (
              <>
                <BotQuota quota={quota} />
                <MenuSeparator className="mx-1" />
              </>
            ) : null}
            {pictures ? (
              <MenuItem
                onClick={onUpload}
                disabled={full}
                className="data-disabled:pointer-events-none data-disabled:opacity-50"
              >
                <ArrowUpTrayIcon className="size-[1.125rem]" />
                Upload a picture
              </MenuItem>
            ) : null}
            <MenuItem
              onClick={onPoll}
              disabled={!canPoll}
              className="data-disabled:pointer-events-none data-disabled:opacity-50"
            >
              <ChartBarIcon className="size-[1.125rem]" />
              Create a poll
            </MenuItem>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </Menu>
  );
}
