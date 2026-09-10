"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
  ArrowUpIcon,
  ArrowUpTrayIcon,
  ArrowUturnLeftIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { MicrophoneIcon } from "@heroicons/react/24/solid";
import { useQuery } from "convex/react";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import {
  MentionPicker,
  MentionText,
  optionId,
  type MentionPerson,
} from "@/components/app/chat/mentions";
import { AttachmentTray } from "@/components/app/chat/thread/attachment-tray";
import { BotQuota } from "@/components/app/chat/thread/bot-quota";
import { replyFromMessage } from "@/components/app/chat/thread/reply-preview";
import { useAttachments } from "@/components/app/chat/thread/use-attachments";
import { useAutogrow } from "@/components/app/chat/thread/use-autogrow";
import { useMentionInput } from "@/components/app/chat/thread/use-mention-input";
import { useTypingBeat } from "@/components/app/chat/typing";
import { Waveform } from "@/components/app/chat/waveform";
import { personName, refusalMessage, type Refusal } from "@/lib/chat";
import { MAX_IMAGES_PER_MESSAGE, rememberPreview } from "@/lib/images";
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

/**
 * The box at the bottom of a conversation.
 *
 * A textarea with four things around it: the pictures waiting to go with the
 * words (`useAttachments`), the twin that gives the box its height
 * (`useAutogrow`), the `@` picker (`useMentionInput`), and dictation. The
 * composer owns the words and the send; each of those owns its own state and
 * hands back what the render needs. What the thread may ask of it is
 * `ComposerHandle`, and the thread is the only caller.
 */

/** The textarea's own cap, which the server enforces again. */
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
};

/** The picker's id, for the field to point `aria-controls` at. One thread
 *  is on screen at a time, so one id is enough. */
const PICKER_ID = "mention-picker";

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
}: {
  ref: Ref<ComposerHandle>;
  onSubmit: (
    text: string,
    attachmentIds: Id<"attachments">[],
    previews: ChatImage[],
    replyTo: ChatMessage | null,
    mentions: ChatMention[],
    everyone: boolean,
  ) => Promise<Refusal | null>;
  /**
   * Whether pictures are on for this deployment. Off, there is no plus, no
   * paste and no drop — `addFiles` is the one door and it is shut — and the
   * box is the box it was before pictures existed.
   */
  pictures: boolean;
  replyingTo: ChatMessage | null;
  onCancelReply: () => void;
  /** For the mention picker. See `useMentionPeople`. */
  conversationId: Id<"conversations">;
  kind: "global" | "dm" | "group" | null;
  peer: MentionPerson | null;
  authors: MentionPerson[];
  me: string | null | undefined;
}) {
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

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

  const { fieldRef, mirror, backdrop, height, syncBackdrop } =
    useAutogrow(shown);

  useEffect(() => {
    if (replyingTo !== null) fieldRef.current?.focus();
  }, [replyingTo, fieldRef]);

  /**
   * The whole text, as the field now holds it, into `body`.
   *
   * Editing while a dictation guess is showing: keep the guess out of `body`
   * while it is still at the end. If the edit went through it, keep what was
   * typed and let the next final land after it.
   */
  function commit(next: string) {
    const tail =
      dictation.interim === "" ? "" : joinSpoken(" ", dictation.interim);
    setBody(
      tail !== "" && next.endsWith(tail) ? next.slice(0, -tail.length) : next,
    );
    setNotice(null);
  }

  const picker = useMentionInput({
    shown,
    fieldRef,
    commit,
    maxLength: MAX_BODY,
    conversationId,
    kind,
    peer,
    authors,
    me,
  });

  // Keep the newest words in view once the box has hit its height.
  useEffect(() => {
    const el = fieldRef.current;
    if (el !== null && dictation.interim !== "") el.scrollTop = el.scrollHeight;
  }, [shown, dictation.interim, fieldRef]);

  const tray = useAttachments({ pictures, onNotice: setNotice });
  const fileInput = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    addFiles: tray.addFiles,
    focus: () => fieldRef.current?.focus(),
  }));

  const canSend =
    !tray.waiting && (shown.trim() !== "" || tray.ready.length > 0);

  async function submit() {
    if (!canSend) return;
    const text = shown.trim();
    const sending = tray.ready;

    // Nothing further may arrive into a box that has just been emptied.
    dictation.abort();
    setBody("");
    picker.setCaret(0);
    tray.clear();
    setNotice(null);

    // Who the text names, from the people the picker offered, for the
    // placeholder to draw. The server reads the body and decides for itself.
    const mentions: ChatMention[] = [];
    let everyone = false;
    for (const token of findMentionTokens(text)) {
      if (token.handle === EVERYONE) {
        if (kind === "group") everyone = true;
        continue;
      }
      const person = picker.people.known.get(token.handle);
      if (person === undefined) continue;
      if (mentions.some((entry) => entry.clerkId === person.clerkId)) continue;
      mentions.push({ clerkId: person.clerkId, handle: person.handle });
    }

    // Every entry in `sending` is `ready`, and `ready` always carries an id —
    // see `Attached`. The filter is for the type, not for a case.
    const proven = sending.flatMap((entry) =>
      entry.attachmentId === undefined
        ? []
        : [{ ...entry, attachmentId: entry.attachmentId }],
    );

    const refusal = await onSubmit(
      text,
      proven.map((entry) => entry.attachmentId),
      proven.map((entry) => ({
        attachmentId: entry.attachmentId,
        url: entry.preview,
        width: entry.width,
        height: entry.height,
      })),
      replyingTo,
      mentions,
      everyone,
    );

    if (refusal === null) {
      // The real rows are on screen by now — see `submit` in `Thread` for why
      // that is a guarantee and not a race. The previews are not revoked:
      // they are what the real rows will be drawn with, see `rememberPreview`.
      for (const entry of proven) {
        rememberPreview(entry.attachmentId, entry.preview);
      }
      return;
    }

    setNotice(refusalMessage(refusal));
    // Handed back rather than dropped. Somebody who wrote three sentences and
    // hit a rule on one word should not have to write them again.
    setBody(text);

    if (refusal === "image" || refusal === "too-many-images") {
      // The rows are gone — swept, or discarded from another tab. The
      // pictures have to be added again, so the previews go.
      for (const entry of sending) URL.revokeObjectURL(entry.preview);
    } else {
      // Refused for the words. The pictures are still `ready` on the server
      // and come back into the tray with the text.
      tray.restore(sending);
    }
    fieldRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (picker.onKeyDown(event)) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void submit();
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

      {/* One radius whatever is in it. At a single line the box is fifty
          pixels tall, so a 25px corner *is* the pill; with a tray above or a
          paragraph in it, the same corner is a card. It used to switch
          between `rounded-full` and this, and animating a radius from nine
          thousand pixels to twenty-five is a shape doing something strange
          on the way. */}
      <div className="composer flex flex-col rounded-[25px] border border-border bg-surface shadow-[0_1px_2px_rgba(15,15,15,0.04),0_4px_12px_rgba(15,15,15,0.08),0_12px_28px_-8px_rgba(15,15,15,0.14)] transition-[border-color,box-shadow] has-[textarea:focus]:border-primary has-[textarea:focus]:shadow-[0_1px_2px_rgba(15,15,15,0.04),0_6px_16px_rgba(15,15,15,0.1),0_16px_36px_-8px_rgba(15,15,15,0.18)]">
        {replyingTo === null ? null : (
          <div className="mx-3 mt-3 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-3 py-2.5">
            <ArrowUturnLeftIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.75rem] font-semibold text-primary">
                Replying to{" "}
                {personName({
                  handle: replyingTo.authorHandle,
                  displayName: replyingTo.authorName,
                })}
              </p>
              <p className="line-clamp-2 text-[0.8125rem] break-words text-muted-foreground">
                {replyFromMessage(replyingTo).preview}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="Cancel reply"
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-faint outline-none hover:bg-foreground/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        )}

        <AttachmentTray
          attached={tray.attached}
          ghost={tray.ghost}
          onRemove={tray.remove}
          onSettled={tray.settle}
        />

        <div
          className={cn(
            "flex items-end gap-2 py-1.5 pr-1.5",
            pictures ? "pl-1.5" : "pl-4",
          )}
        >
          {/* The plus on the left, where every chat puts it. It opens a
              small menu: how many `@bot` tags are left today, then the
              picker. Pasting and dropping reach the same `addFiles`. */}
          {pictures ? (
            <>
              <PlusMenu
                quota={quota}
                full={tray.attached.length >= MAX_IMAGES_PER_MESSAGE}
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

          {/* The box and its twin. The twin is absolute, so it costs the row
              no height of its own, and it is given the same width by
              `inset-x-0` — which is what makes its wrapping the box's
              wrapping. See `useAutogrow`. */}
          <div className="relative min-w-0 flex-1">
            <div
              ref={mirror}
              aria-hidden
              className="pointer-events-none invisible absolute inset-x-0 top-0 py-1.5 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap"
            >
              {/* The placeholder when empty, so an empty box is one line
                  tall; a zero-width space at the end, so a trailing newline
                  counts as the line it is about to be. */}
              {shown === "" ? "Say something" : shown}
              {"​"}
            </div>

            {/* The words, in colour, under the field. The textarea above
                lays out the same text transparent and keeps everything a
                textarea does — the caret, selection, undo, the platform's
                own editing — and this is the only layer with ink in it, so
                a mention can be a chip inside the box without the box
                becoming something that is not a textarea. The two agree on
                every glyph because they share a font, a width and a padding,
                and because the chip changes no glyph's width — see
                `.mention-chip` in `globals.css`. It scrolls with the field. */}
            <div
              ref={backdrop}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden py-1.5 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap text-foreground"
            >
              <MentionText
                body={body}
                resolve={picker.resolveTyped}
                me={me}
                plain
              />
              {/* The dictation guess, after the words, and quieter: it is
                  not text yet. */}
              {dictation.interim === "" ? null : (
                <span className="text-muted-foreground">
                  {shown.slice(body.length)}
                </span>
              )}
              {"​"}
            </div>

            {picker.picking ? (
              <MentionPicker
                id={PICKER_ID}
                candidates={picker.candidates}
                active={picker.highlighted}
                loading={picker.people.loading}
                query={picker.mention?.query ?? ""}
                onActiveChange={picker.setActive}
                onPick={picker.pick}
              />
            ) : null}

            <textarea
              ref={fieldRef}
              value={shown}
              style={{ height }}
              onChange={(event) => {
                commit(event.target.value);
                picker.setCaret(event.target.selectionStart);
                picker.setActive(0);
              }}
              onSelect={(event) =>
                picker.setCaret(event.currentTarget.selectionStart)
              }
              onScroll={syncBackdrop}
              onKeyDown={onKeyDown}
              onPaste={tray.onPaste}
              rows={1}
              maxLength={MAX_BODY}
              aria-label="Message"
              aria-autocomplete="list"
              aria-controls={picker.picking ? PICKER_ID : undefined}
              aria-activedescendant={
                picker.picking && picker.candidates.length > 0
                  ? optionId(PICKER_ID, picker.highlighted)
                  : undefined
              }
              placeholder={
                live
                  ? "Listening…"
                  : tray.attached.length > 0
                    ? "Add a caption, or just send"
                    : "Say something"
              }
              // Transparent ink and a visible caret: the words are drawn by
              // the layer behind. No scrollbar, so the field and that layer
              // wrap at the same width — the box is eight lines at most and
              // still scrolls under the wheel and the arrows.
              className="relative block w-full resize-none [scrollbar-width:none] overflow-y-auto bg-transparent py-1.5 text-[0.9375rem] leading-relaxed text-transparent caret-foreground transition-[height] duration-150 ease-out outline-none placeholder:text-faint disabled:cursor-not-allowed motion-reduce:transition-none dark:placeholder:text-muted-foreground [&::-webkit-scrollbar]:hidden"
            />
          </div>
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
            <ArrowUpIcon
              strokeWidth={2.5}
              className="size-4 transition-transform duration-200 ease-out group-hover/button:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover/button:translate-y-0"
            />
            Send
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
  full,
  onUpload,
}: {
  quota: Parameters<typeof BotQuota>[0]["quota"];
  /** The tray already holds as many as one message may carry. */
  full: boolean;
  onUpload: () => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label="More"
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
            <BotQuota quota={quota} />
            <MenuSeparator className="mx-1" />
            <MenuItem
              onClick={onUpload}
              disabled={full}
              className="data-disabled:pointer-events-none data-disabled:opacity-50"
            >
              <ArrowUpTrayIcon className="size-[1.125rem]" />
              Upload a picture
            </MenuItem>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </Menu>
  );
}
