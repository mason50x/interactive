import { v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation, query } from "../_generated/server";
import { callerProfile, clearSender, membership } from "./shared";

/**
 * Leaving chat, without leaving the site.
 *
 * The account itself is Clerk's and deleting it is a different button in a
 * different place. This one is about the identity built on top of it — the
 * handle, the groups, the friends, and every word said under any of them — and
 * it exists because the two are not the same decision. Somebody who wants their
 * messages gone should not have to close the account they use for everything
 * else in order to get it, and somebody who regrets the handle they picked at
 * thirteen should not be told that two renames is all there is.
 *
 * ## What goes
 *
 * Every message, in every conversation. Every group they own, whoever else was
 * in it. Every group they were merely in, left rather than closed. Both halves
 * of every direct message, because a thread with one side deleted is a
 * monologue nobody consented to keeping. Friends, blocks in both directions,
 * reports filed and reports received, and the profile itself — which releases
 * the handle for anybody to claim.
 *
 * ## What stays, and why
 *
 * The strike ledger. It is the one thing here that is not theirs to clear, and
 * the reason is arithmetic rather than principle: the mute lives on the profile
 * and the profile is being deleted, so an erasure that also cleared the ledger
 * would be a working way out of every consequence this system can impose. Press
 * it, claim a new handle, and speak. `carriedConsequence` in
 * `convex/chat/shared.ts` is what puts the mute back on the new profile, and it
 * only has anything to put back because the strikes survive.
 *
 * They are not much of a record to leave behind. A strike is a rule, a weight,
 * an expiry, and up to a hundred and twenty characters of what was said; it
 * names no handle, because handles are not what it is keyed by. And it expires
 * on its own after thirty days.
 *
 * A ban is the same argument taken one step further. It has no expiry at all,
 * and it is a field on the profile rather than on the ledger — so for a banned
 * account, and only for a banned account, the profile is emptied instead of
 * deleted and the handle stays with it. Everything else still goes. That is
 * both halves of what the ban was for: the messages leave, and the name of the
 * account that earned it is not handed back to be claimed by somebody else or
 * re-claimed by them.
 */

/** The most conversations one preview will count. */
const MAX_CONVERSATIONS = 200;

export type ErasePreview = {
  handle: string;
  /** Groups they own. These are deleted, and take everyone's messages. */
  owned: number;
  /** Groups they are only in. These they simply leave. */
  groups: number;
  /** Direct messages. Both sides go — see the note above. */
  dms: number;
  /**
   * Whether the handle is kept because the account is closed. The button says
   * something different when this is true, and it is the only thing that
   * changes.
   */
  banned: boolean;
};

/**
 * What pressing the button would do, counted rather than described.
 *
 * The counts are the whole point of this query. "Delete everything" is a
 * sentence somebody can agree to without picturing any of it; "three groups you
 * own will be deleted, and everything said in them" is a number they can
 * recognise as wrong before it is too late to matter.
 *
 * Bounded by `MAX_CONVERSATIONS`, which is far past what anybody is in and is
 * only there so a confirmation dialog can never be the expensive query on the
 * site. The erasure itself is not bounded by it.
 */
export const preview = query({
  args: {},
  handler: async (ctx): Promise<ErasePreview | null> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return null;

    const rows = await ctx.db
      .query("conversationMembers")
      .withIndex("byUser", (q) => q.eq("clerkId", profile.clerkId))
      .take(MAX_CONVERSATIONS);

    let owned = 0;
    let groups = 0;
    let dms = 0;

    for (const row of rows) {
      // The global room is not counted. Everybody is in it, leaving it is one
      // row, and it is the one conversation here that outlives everyone.
      if (row.kind === "global") continue;
      if (row.status === "banned" || row.status === "left") continue;

      if (row.kind === "dm") {
        dms += 1;
        continue;
      }
      if (row.role === "owner") owned += 1;
      else groups += 1;
    }

    return {
      handle: profile.handle,
      owned,
      groups,
      dms,
      banned: profile.bannedAt !== undefined,
    };
  },
});

export type EraseResult = { ok: true } | { ok: false; reason: "no-profile" | "handle" };

/**
 * Do it.
 *
 * The handle is typed back rather than a checkbox ticked, and it is checked
 * here rather than only in the field. This is the one irreversible thing a
 * person can do to their own account from inside the app, and the argument that
 * makes it irreversible — the messages are actually deleted, not marked — is
 * the same argument that makes a mis-click unrecoverable.
 *
 * Two steps, and the order matters. The profile goes first and synchronously,
 * because deleting it is what ends the ability to send: `messages.send` reads
 * `callerProfile` before anything else, so the moment this mutation commits
 * there is no way to add to what the purge is about to walk. Everything
 * unbounded is then booked for immediately afterwards — see `purgeAuthor` in
 * `convex/chat/sweep.ts`, which is handed the instant this happened so that a
 * handle claimed while it is still running is not swept up by it.
 */
export const eraseMine = mutation({
  args: { confirm: v.string() },
  handler: async (ctx, { confirm }): Promise<EraseResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, reason: "no-profile" };
    if (confirm.trim().toLowerCase() !== profile.handle) {
      return { ok: false, reason: "handle" };
    }

    const now = Date.now();

    // Their seat in the global room, taken here rather than left to the purge.
    // Everything else the purge removes stays removed, but this one row is
    // re-created the instant a new handle is claimed — and a claim that lands
    // in the moment between this mutation and the purge would create it, watch
    // the purge delete it again, and leave somebody with a handle and no room
    // to use it in. Two indexed reads to close a window measured in
    // milliseconds, on the one path where the window has a visible cost.
    const room = await ctx.db
      .query("conversations")
      .withIndex("byKind", (q) => q.eq("kind", "global"))
      .first();
    if (room !== null) {
      const seat = await membership(ctx, room._id, profile.clerkId);
      if (seat !== null) await ctx.db.delete(seat._id);
    }

    await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeAuthor, {
      clerkId: profile.clerkId,
      mode: "chat",
      before: now,
    });

    // The counter and the ring, which are a row of their own now — see
    // `chatSenders` in `convex/schema.ts`. Taken on both branches below:
    // whether the profile is emptied or deleted, how much this account has
    // said and what it last said go with it.
    await clearSender(ctx, profile.clerkId);

    // A closed account keeps its name and nothing else. See the note at the top
    // for why this is the one profile that is emptied rather than deleted; the
    // fields cleared here are every field on it that anybody but the system
    // ever sees.
    if (profile.bannedAt !== undefined) {
      await ctx.db.patch(profile._id, {
        avatarHue: undefined,
        avatarEmoji: undefined,
        avatarInitials: undefined,
        dmPolicy: "nobody",
        discoverable: false,
      });
      return { ok: true };
    }

    await ctx.db.delete(profile._id);
    return { ok: true };
  },
});
