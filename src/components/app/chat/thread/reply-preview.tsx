"use client";

import { personName } from "@/lib/chat";
import { cn } from "@/lib/utils";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { ChatMessage } from "../../../../../convex/chat/messages";

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
          "mb-1 w-full rounded-xl border border-border bg-surface-muted/70 px-3 py-2 text-left",
          mine && "text-right",
        )}
      >
        <span className="block text-[0.75rem] font-semibold text-faint">
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
        "mb-1 w-full rounded-xl border border-border bg-surface-muted/70 px-3 py-2 text-left transition-colors outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring/60",
        mine && "text-right",
      )}
      aria-label={`Go to message from ${name}`}
    >
      <span className="block truncate text-[0.75rem] font-semibold text-primary">
        {name}
      </span>
      {/* Two lines and then a cut, rather than one line and an ellipsis: a
          long message quoted in one unbreakable line was what set the
          bubble's width, and long messages are the ones worth quoting. */}
      <span className="line-clamp-2 text-[0.8125rem] break-words text-muted-foreground">
        {reply.preview}
      </span>
    </button>
  );
}
