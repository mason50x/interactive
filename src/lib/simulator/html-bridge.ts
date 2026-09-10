/**
 * The player's side of the `interactive-html` channel.
 *
 * `html-document.ts` writes the bootstrap that runs inside the sandboxed
 * frame; this is what the parent does with what comes back. The frame is
 * opaque and untrusted, so a message counts only when it comes from that
 * frame's window, from the `null` origin a sandboxed `srcdoc` has, on this
 * channel, carrying the per-session token the bootstrap was given, and with
 * an integer id the reply can be matched to. Anything else is dropped
 * without a reply, so a stray script cannot learn that the channel exists.
 */

const HTML_CHANNEL = "interactive-html";

export type FrameRequest = {
  id: number;
  type: unknown;
  value: unknown;
};

/** The request in `event`, or `null` for anything that is not one. */
export function readFrameRequest(
  event: MessageEvent,
  frame: Window | null | undefined,
  token: string,
): FrameRequest | null {
  const data: unknown = event.data;
  if (
    event.source !== frame ||
    event.origin !== "null" ||
    typeof data !== "object" ||
    data === null
  )
    return null;
  const message = data as Record<string, unknown>;
  if (
    message.channel !== HTML_CHANNEL ||
    message.token !== token ||
    !Number.isSafeInteger(message.id)
  )
    return null;
  return {
    id: message.id as number,
    type: message.type,
    value: message.value,
  };
}

/** Posts on the channel with the token attached; a no-op without a frame. */
export function postToFrame(
  frame: Window | null | undefined,
  token: string,
  message: Record<string, unknown>,
) {
  frame?.postMessage({ channel: HTML_CHANNEL, token, ...message }, "*");
}

/**
 * A fixed-window rate limit: at most `limit` calls in any window of
 * `windowMs`, counted from the first call after the last window lapsed.
 * Returns whether the call it was asked about is still within the limit.
 * Imported HTML that saves in a tight loop is throttled here rather than
 * being allowed to hammer IndexedDB.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  let windowStart = Date.now();
  let requests = 0;
  return () => {
    if (Date.now() - windowStart > windowMs) {
      windowStart = Date.now();
      requests = 0;
    }
    return ++requests <= limit;
  };
}
