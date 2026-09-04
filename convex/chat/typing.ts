import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  blockedBy,
  blockedEitherWay,
  callerProfile,
  clearTyping,
  membership,
} from "./shared";

/**
 * Who is writing something, for the row of dots under the thread.
 *
 * `presence.ts` is the model, and the note at the top of it is the argument
 * for this shape: a row per person, refreshed by that person alone, read by
 * everybody else, and never marked "stopped" — because a stop is a message
 * that has to arrive from a browser that may have just been closed. Here the
 * row carries the instant it stops counting instead, and a browser that shut
 * mid-sentence falls out of the answer a few seconds later on its own.
 *
 * ## The two clocks
 *
 * The window is short enough that the reader cannot wait for the next push to
 * find out a row has expired: nothing writes the table when somebody simply
 * stops, so the subscription would sit on a stale "alice is typing" until
 * somebody else did something. So `who` hands back how long each row has
 * *left* rather than when it ends, and the client counts that down on its
 * own clock from the moment the answer arrived. Two clocks that disagree by a
 * minute still agree about six seconds.
 *
 * ## What it costs
 *
 * A write per typist per `REFRESH_AFTER_MS` while their box has words in it,
 * and each write re-runs `who` for everybody reading that conversation. It
 * is the presence quadratic again, only faster — which is why a keystroke is
 * not a write: the client beats at most every `TYPING_BEAT_MS` (see
 * `src/lib/chat.ts`), the server refuses to rewrite a row that is still
 * fresh, and the reader's query is one indexed range bounded by `MAX_TYPING`.
 */

/**
 * How long one beat counts for.
 *
 * Comfortably more than two of the client's `TYPING_BEAT_MS`, so a beat lost
 * to a slow connection does not blink somebody out mid-word. It is also how
 * long the dots linger after somebody stops: long enough that a pause for
 * thought reads as a pause, short enough that a closed tab does not keep
 * "typing" for a whole conversation.
 */
export const TYPING_WINDOW_MS = 8_000;

/**
 * How fresh a row may be and still be rewritten.
 *
 * A row refreshed two seconds ago will still say "typing" for six more, and
 * writing it again would only recompute everybody else's subscription to say
 * the same thing. So a beat that lands on a young row reads it and leaves it.
 */
const REFRESH_AFTER_MS = 2_500;

/**
 * The most typists one answer will name.
 *
 * Past three the caption stops naming people anyway — "alice, bob and 5
 * others" — and past this the number itself is not information. A room where
 * more than eight people are writing at once reads as "lots", and is not
 * worth a bigger range read to be exact about.
 */
const MAX_TYPING = 8;

export type Typist = {
  clerkId: string;
  handle: string;
  displayName?: string;
  /** Milliseconds this row has left, as of the moment the query ran. */
  left: number;
};

/**
 * I have words in the box.
 *
 * Called on the first keystroke and then at most every `TYPING_BEAT_MS` for as
 * long as keys keep coming. Silent about everything, exactly as a presence
 * beat is: signed out, no handle, not a member, muted, banned — all write
 * nothing, and none of them is a fact this function has any reason to hand
 * back. The composer is shut for the muted and the banned anyway; this is
 * the check for a browser that was asked to call it regardless.
 *
 * A blocked direct message writes nothing either. The send would be refused,
 * and "typing" from somebody whose message can never arrive is a promise of
 * a thing that will not happen.
 */
export const start = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    if (profile.bannedAt !== undefined) return;

    const now = Date.now();
    if (profile.mutedUntil !== undefined && profile.mutedUntil > now) return;

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") return;

    if (member.dmPeer !== undefined) {
      if (await blockedEitherWay(ctx, profile.clerkId, member.dmPeer)) return;
    }

    const existing = await ctx.db
      .query("typing")
      .withIndex("byConversationUser", (q) =>
        q.eq("conversationId", conversationId).eq("clerkId", profile.clerkId),
      )
      .unique();

    const until = now + TYPING_WINDOW_MS;

    if (existing === null) {
      await ctx.db.insert("typing", {
        conversationId,
        clerkId: profile.clerkId,
        handle: profile.handle,
        displayName: profile.displayName,
        until,
      });
      return;
    }

    // Still young. See `REFRESH_AFTER_MS` — this row is what everybody else's
    // subscription is drawn from, and rewriting it makes them all re-read.
    if (existing.until - now > TYPING_WINDOW_MS - REFRESH_AFTER_MS) return;

    await ctx.db.patch(existing._id, {
      handle: profile.handle,
      displayName: profile.displayName,
      until,
    });
  },
});

/**
 * The box is empty, or I have left.
 *
 * Best effort, and the window above is what makes it safe to be. It fires
 * when the last character is deleted and when the composer unmounts, which
 * are the two cases where waiting out the window would be visibly wrong: a
 * box you cleared should stop saying "typing" now, not in eight seconds. A
 * send clears the row too, inside the same transaction that writes the
 * message — see `clearTyping` in `convex/chat/messages.ts` — so the dots and
 * the words never overlap on anybody's screen.
 *
 * No membership check, for the reason `presence.gone` has none: the only row
 * this can reach is the caller's own.
 */
export const stop = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    await clearTyping(ctx, conversationId, profile.clerkId);
  },
});

/**
 * Who is writing in this conversation, other than me.
 *
 * `null` to anybody who is not an active member, the same bar every other
 * question about a conversation sets. People the caller has blocked are left
 * out: their messages are hidden from this reader already, and a "typing"
 * for a message that will never be shown is worse than nothing.
 *
 * Read from the far end of the index — the rows with the most time left —
 * so that under the cap it is the freshest typists who are named.
 */
export const who = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }): Promise<Typist[] | null> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return null;

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") return null;

    const now = Date.now();
    const rows = await ctx.db
      .query("typing")
      .withIndex("byConversationUntil", (q) =>
        q.eq("conversationId", conversationId).gt("until", now),
      )
      .order("desc")
      .take(MAX_TYPING);

    const blocked = await blockedBy(ctx, profile.clerkId);

    return rows
      .filter((row) => row.clerkId !== profile.clerkId && !blocked.has(row.clerkId))
      .map((row) => ({
        clerkId: row.clerkId,
        handle: row.handle,
        displayName: row.displayName,
        left: row.until - now,
      }));
  },
});
