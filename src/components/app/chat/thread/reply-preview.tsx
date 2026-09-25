"use client";

import { personName } from "@/lib/chat";
import { cn } from "@/lib/utils";
import type { Id } from "@convex/_generated/dataModel";
import type { ChatMessage } from "@convex/chat/messages";

/**
 * The quoted message above a reply.
 *
 * Two halves of one thing: `replyFromMessage` is how a message becomes the
 * quote — the shape the server stores on the row, built here so the
 * placeholder message and the composer's own "Replying to" line agree with
 * what the real row is about to show — and `ReplyPreview` is that quote drawn
 * over the bubble, pressed to go and find the original.
 */
export function replyFromMessage(
  message: ChatMessage,
): NonNullable<ChatMessage["replyTo"]> {
  const body = message.body.replace(/\s+/g, " ").trim();
  const preview =
    body !== ""
      ? body.slice(0, 160)
      : message.images.length === 1
        ? "Photo"
        : message.images.length > 1
          ? `${message.images.length} photos`
          : "Message";

  return {
    messageId: message._id,
    unavailable: false,
    authorClerkId: message.authorClerkId,
    authorHandle: message.authorHandle,
    authorName: message.authorName,
    preview,
  };
}

export function ReplyPreview({
  reply,
  mine,
  onJumpToMessage,
}: {
  reply: NonNullable<ChatMessage["replyTo"]>;
  mine: boolean;
  onJumpToMessage: (messageId: Id<"messages">) => void;
}) {
  if (reply.unavailable) {
    return (
      <div
        className={cn(
          "mb-1 flex max-w-full gap-2 px-1",
          mine && "flex-row-reverse text-right",
        )}
      >
        <span aria-hidden className="w-0.5 shrink-0 rounded-full bg-border" />
        <span className="py-0.5 text-[0.8125rem] text-faint italic">
          Original message unavailable
        </span>
      </div>
    );
  }

  const handle = reply.authorHandle ?? "unknown";
  const name = personName({ handle, displayName: reply.authorName });

  return (
    <button
      type="button"
      onClick={() => onJumpToMessage(reply.messageId)}
      className={cn(
        "group/reply mb-1 flex max-w-full gap-2 rounded-md px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        mine && "flex-row-reverse text-right",
      )}
      aria-label={`Go to message from ${name}`}
    >
      <span
        aria-hidden
        className="w-0.5 shrink-0 rounded-full bg-border transition-colors group-hover/reply:bg-primary/60"
      />
      {/* Two lines and then a cut, rather than one line and an ellipsis: a
          long message quoted in one unbreakable line was what set the
          bubble's width, and long messages are the ones worth quoting. */}
      <span className="min-w-0 py-0.5 text-[0.8125rem] leading-snug">
        <span className="block truncate font-semibold text-muted-foreground transition-colors group-hover/reply:text-foreground">
          {name}
        </span>
        <span className="line-clamp-2 break-words text-faint">
          {reply.preview}
        </span>
      </span>
    </button>
  );
}
