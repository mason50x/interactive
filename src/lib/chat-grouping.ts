import type { ChatMessage } from "@convex/chat/messages";

/** A visual run ends at a pause, a different day, or a richer message. */
export function messagesConnect(
  before: ChatMessage | undefined,
  after: ChatMessage | undefined,
): boolean {
  if (!before || !after) return false;
  const elapsed = after._creationTime - before._creationTime;
  return (
    before.status === "visible" &&
    after.status === "visible" &&
    before.authorClerkId === after.authorClerkId &&
    elapsed >= 0 &&
    elapsed < 5 * 60_000 &&
    new Date(before._creationTime).toDateString() ===
      new Date(after._creationTime).toDateString() &&
    before.images.length === 0 &&
    after.images.length === 0 &&
    !before.poll &&
    !after.poll &&
    !after.replyTo &&
    before.reactions.length === 0
  );
}
