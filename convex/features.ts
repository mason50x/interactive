import { query } from "./_generated/server";

/**
 * The switches, read off the deployment.
 *
 * A feature that costs something to run wants a way to be turned off that is
 * not a deploy: an environment variable on the Convex deployment is set from
 * a terminal, takes effect on the next function call, and is the same
 * mechanism the deployment already uses for its secrets. `IMAGES_ENABLED=1`
 * is pictures in chat; anything else — `0`, unset, a typo — is off, because
 * the safe default for a switch on a paid path is the one that costs nothing.
 *
 * ## The server does not trust the client to read this
 *
 * The query below is how the app learns to hide a button. It is not how the
 * feature is enforced: `imagesEnabled()` is read again in every mutation that
 * would accept a picture, because a hidden button is a courtesy and the
 * mutation can be called without one. See `maySend` in
 * `convex/chat/attachments.ts` and `send` in `convex/chat/messages.ts`.
 */
export function imagesEnabled(): boolean {
  return process.env.IMAGES_ENABLED === "1";
}

export type Features = { images: boolean };

/** What the app may offer. Public: nothing here is worth hiding. */
export const get = query({
  args: {},
  handler: async (): Promise<Features> => ({ images: imagesEnabled() }),
});
