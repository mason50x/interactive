import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { callerProfile, membership } from "./shared";

/**
 * Who is in the room right now.
 *
 * The thread header used to count active memberships, which is a count of who
 * *may* be here rather than who is — a group of forty read by two people said
 * "40 in here", and the room where everybody has an account said nothing at
 * all. This is the other number, and it is the one worth a live dot.
 *
 * ## The shape of it
 *
 * Three functions and no state machine. `here` refreshes the caller's own row,
 * `gone` deletes it, and `count` answers how many rows are inside the window.
 * Nobody is ever marked away, because "away" is a message that has to arrive
 * from a browser that may have already closed — see the note on the `presence`
 * table in `convex/schema.ts` for why absence is derived from a stale timestamp
 * instead.
 *
 * ## What it costs
 *
 * A write per open conversation per `REFRESH_AFTER_MS`, and each of those
 * re-runs the `count` subscription of everybody else in that conversation. That
 * is the quadratic anybody would notice first, and it is accepted here on
 * purpose: the work per re-run is one indexed range read bounded by
 * `MAX_PRESENT`, and rooms are refreshed slowly enough that a hundred people is
 * a hundred reads twice a minute.
 *
 * The beat and the write are two different intervals, which is the cheap half
 * of this. The client beats every `HEARTBEAT_MS` because that is how quickly it
 * can notice it has stopped being able to; the row is only rewritten once it is
 * old enough for the refresh to mean something. It is also why the heartbeat
 * stops the moment a tab is hidden — a background tab is not in the room, and
 * it should not be paying everybody else's subscription to say so.
 *
 * If the room ever gets big enough for that to hurt, the fix is to count into
 * coarse buckets rather than to make the heartbeat slower; a slower heartbeat
 * makes the dot lie for longer, which is the one thing it may not do.
 */

/**
 * How long a heartbeat counts for.
 *
 * Comfortably more than two beats of the client's `HEARTBEAT_MS` in
 * `src/lib/chat.ts`, so a single dropped or slow beat never blinks somebody out
 * of a room they are sitting in. The two numbers are not imported from one
 * another — a value import from here would pull this module's server code into
 * the browser bundle, which `eslint.config.mjs` refuses — so they are kept in
 * step by this sentence.
 */
export const PRESENCE_WINDOW_MS = 50_000;

/**
 * How stale a row has to be before a beat bothers to refresh it.
 *
 * The heartbeat is what the client can be relied on to send; this is what the
 * database is asked to write, and they do not have to be the same number. A
 * beat that lands on a row refreshed ten seconds ago is asking to change a
 * timestamp that already says "here" and will still say it well past the next
 * beat — and the write is not free: it recomputes the `count` subscription of
 * everybody else in the conversation, which is the quadratic the note above is
 * about. So most beats now read a row and leave it alone.
 *
 * Thirty seconds, against a fifty-second window and a fifteen-second beat, so a
 * row is written every other beat and its worst age is thirty seconds — twenty
 * short of going stale, which is a whole beat of slack for one that never
 * arrives. Any larger and a dropped beat could blink somebody out of a room
 * they are sitting in, which is the one thing the window exists to prevent.
 */
const REFRESH_AFTER_MS = 30_000;

/**
 * The most rows one count will read.
 *
 * The number stops being interesting long before it stops being large: nobody
 * reads "213 in here" as anything other than "lots". Past this the answer says
 * so instead of paying to be exact.
 */
const MAX_PRESENT = 200;

export type Presence = {
  present: number;
  /** `present` hit `MAX_PRESENT` and the true number is higher. */
  capped: boolean;
};

/**
 * I am looking at this conversation.
 *
 * Called on open and then on an interval. Silent about everything: signed out,
 * no handle, not a member, a member who has not been admitted or who was
 * removed — all of them simply write nothing. A presence beat is not a request
 * that can be refused, and a refusal is a fact about somebody's standing that
 * this function has no reason to hand back.
 *
 * Direct messages are skipped rather than tracked and ignored. There is no
 * count on screen for a conversation with two people in it, so a row would be a
 * write per fifteen seconds that nothing ever reads.
 */
export const here = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") return;
    if (member.kind === "dm") return;

    const existing = await ctx.db
      .query("presence")
      .withIndex("byConversationUser", (q) =>
        q.eq("conversationId", conversationId).eq("clerkId", profile.clerkId),
      )
      .unique();

    const now = Date.now();

    if (existing === null) {
      await ctx.db.insert("presence", {
        conversationId,
        clerkId: profile.clerkId,
        lastSeenAt: now,
      });
      return;
    }

    // Still comfortably fresh, so this beat is a read and nothing more. See
    // `REFRESH_AFTER_MS` — the row is what everybody else's count is drawn
    // from, and rewriting it is what makes them all recount.
    if (now - existing.lastSeenAt < REFRESH_AFTER_MS) return;

    await ctx.db.patch(existing._id, { lastSeenAt: now });
  },
});

/**
 * I have gone.
 *
 * Best effort and not depended on. It fires when somebody moves to another
 * conversation, which is the common way of leaving one and the case where
 * waiting out the window would be visibly wrong — the room you just walked out
 * of should not still be counting you while you are reading the next one.
 *
 * A closed tab sends nothing, and that is handled by the row going stale rather
 * than by trying harder here. Unloading is the one moment a page cannot be
 * relied on to finish a round trip, so a version of this that ran on `pagehide`
 * would be a promise kept most of the time — which for something a green dot is
 * drawn from is worse than a promise never made.
 *
 * No membership check. The only row it can reach is the caller's own, and
 * somebody who has just been removed from a group should still be able to stop
 * being counted in it.
 */
export const gone = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    const existing = await ctx.db
      .query("presence")
      .withIndex("byConversationUser", (q) =>
        q.eq("conversationId", conversationId).eq("clerkId", profile.clerkId),
      )
      .unique();

    if (existing !== null) await ctx.db.delete(existing._id);
  },
});

/**
 * How many people are in this conversation now.
 *
 * `null` to anybody who is not an active member, which is the same bar
 * `conversations.get` sets. How busy a room is is information about the room,
 * and a group nobody has let you into does not answer questions about itself —
 * see `preview` in `convex/chat/conversations.ts` for the one number a
 * non-member is allowed, and why it is deliberately not this one.
 *
 * The floor of one is not a fudge. The caller is an active member with the
 * conversation open, so they are in it by definition; without the floor the
 * header would read "0 in here" for the second between mounting and the first
 * heartbeat landing, which is the only moment anybody would ever see it.
 */
export const count = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }): Promise<Presence | null> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return null;

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") return null;

    const rows = await ctx.db
      .query("presence")
      .withIndex("byConversationSeen", (q) =>
        q
          .eq("conversationId", conversationId)
          .gt("lastSeenAt", Date.now() - PRESENCE_WINDOW_MS),
      )
      .take(MAX_PRESENT);

    return {
      present: Math.max(rows.length, 1),
      capped: rows.length === MAX_PRESENT,
    };
  },
});
