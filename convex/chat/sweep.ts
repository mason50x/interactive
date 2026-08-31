import { v } from "convex/values";
import { GLOBAL_RETENTION_MS } from "../moderation/limits";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

/**
 * The housekeeping, done in pieces small enough to finish.
 *
 * A Convex mutation gets one second. That is the whole reason this file is
 * shaped the way it is: "delete every expired strike" is not a job, it is a job
 * that works for six months and then starts timing out, silently, on a
 * deployment nobody is watching. So each sweep takes a fixed bite, and if the
 * bite came back full it books itself again for immediately afterwards.
 *
 * Nothing here is load-bearing for correctness. Expired strikes are already
 * ignored when standing is computed, and a mute that has run out already reads
 * as lifted — see `standingFor` in `convex/chat/shared.ts` and `mine` in
 * `convex/chat/profiles.ts`. Both had to be true anyway, because a cron that
 * runs at eight in the morning cannot be what decides whether somebody is muted
 * at midnight. This file only keeps the tables from growing forever.
 */

/** How many rows one pass will touch. Well inside the second. */
const BATCH = 200;

/**
 * Delete strikes that have stopped counting.
 *
 * Thirty days after the fact, and the row's only remaining use is the ledger
 * the account holder reads — which filters to unexpired rows anyway. See
 * `STRIKE_TTL_MS` in `convex/moderation/limits.ts` for why they expire at all.
 */
export const expireStrikes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const dead = await ctx.db
      .query("strikes")
      .withIndex("byExpiry", (q) => q.lt("expiresAt", now))
      .take(BATCH);

    for (const row of dead) await ctx.db.delete(row._id);

    if (dead.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.expireStrikes, {});
    }
    return dead.length;
  },
});

/**
 * Drop what the global room said a month ago.
 *
 * Every other table here is bounded by something — one row per account, one per
 * conversation, one per pair. This one is bounded by how much people talk, which
 * is to say by nothing, and a room of strangers is also the place where old
 * messages are least worth keeping and most worth not having. Thirty days is
 * well past where anybody scrolls.
 *
 * Direct messages and groups are left alone. Those are conversations somebody
 * is having, and deleting the middle of one is a different thing entirely.
 */
export const trimGlobal = internalMutation({
  args: { cutoff: v.optional(v.number()) },
  handler: async (ctx, { cutoff }) => {
    const room = await ctx.db
      .query("conversations")
      .withIndex("byKind", (q) => q.eq("kind", "global"))
      .first();
    if (room === null) return 0;

    const before = cutoff ?? Date.now() - GLOBAL_RETENTION_MS;
    const old = await ctx.db
      .query("messages")
      .withIndex("byConversation", (q) =>
        q.eq("conversationId", room._id).lt("_creationTime", before),
      )
      .take(BATCH);

    for (const message of old) await ctx.db.delete(message._id);

    if (old.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.trimGlobal, {
        cutoff: before,
      });
    }
    return old.length;
  },
});

/**
 * Erase a conversation and everything that was said in it.
 *
 * The single place a conversation is destroyed, because there are three ways to
 * reach it and they were about to grow three half-copies of this: the last
 * person leaving a group, a group whose owner deletes their account with nobody
 * left to hand it to, and either side of a direct message closing their account.
 *
 * Messages first and in batches, because that is the only part with no ceiling.
 * A group that ran for a year holds more messages than one mutation can delete
 * inside its one-second budget, so each pass takes a fixed bite and books
 * itself again if the bite came back full. Only once they are gone do the
 * memberships and the conversation row follow — which also means an interrupted
 * purge leaves a conversation nobody can reach rather than a conversation with
 * half its history missing.
 *
 * Reports go too. A report is a claim about a message, and once the message
 * does not exist the claim is an id that resolves to nothing. The strikes it
 * caused stay: those are about a person, not about a room, and the person is
 * still here.
 */
export const purgeConversation = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("byConversation", (q) => q.eq("conversationId", conversationId))
      .take(BATCH);

    for (const message of messages) await ctx.db.delete(message._id);

    if (messages.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeConversation, {
        conversationId,
      });
      return { stage: "messages" as const, deleted: messages.length };
    }

    const reports = await ctx.db
      .query("reports")
      .withIndex("byConversation", (q) => q.eq("conversationId", conversationId))
      .take(BATCH);
    for (const report of reports) await ctx.db.delete(report._id);

    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("byConversation", (q) => q.eq("conversationId", conversationId))
      .collect();
    for (const member of members) await ctx.db.delete(member._id);

    // Last, so that every earlier step can be replayed against a conversation
    // that still exists. Already gone is not an error — two callers can
    // reasonably both decide a room is finished.
    const conversation = await ctx.db.get(conversationId);
    if (conversation !== null) await ctx.db.delete(conversationId);

    return { stage: "done" as const, deleted: messages.length };
  },
});

/**
 * Delete membership rows whose conversation is gone.
 *
 * Nothing should create one. `purgeConversation` removes the memberships in the
 * same pass that removes the room, and every other path deletes or marks the
 * row rather than orphaning it. This exists because "nothing should" is a claim
 * about code that will be edited by people who have not read it, and because
 * the failure it prevents is silent: an orphan row is invisible in the app —
 * `conversations.list` already skips a membership whose conversation does not
 * resolve — so without a sweep they accumulate forever and nobody ever notices.
 *
 * It also cleans up after a hand-edited or partially cleared deployment, which
 * during development is how they actually appear.
 */
export const pruneMemberships = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("conversationMembers")
      .paginate({ numItems: BATCH, cursor: cursor ?? null });

    let removed = 0;
    for (const member of page.page) {
      const conversation = await ctx.db.get(member.conversationId);
      if (conversation !== null) continue;
      await ctx.db.delete(member._id);
      removed += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.pruneMemberships, {
        cursor: page.continueCursor,
      });
    }
    return { removed, done: page.isDone };
  },
});

/**
 * Take an account's chat out of the system, one bite at a time.
 *
 * Scheduled by `users.deleteFromClerk` rather than run inside it. The Clerk
 * webhook is a request with a timeout on it and this is unbounded work — an
 * account that talked a lot has an unbounded number of messages — so the
 * webhook books it and returns, and Convex guarantees a scheduled mutation runs
 * exactly once.
 *
 * Messages first and in batches, because that is the only part that has no
 * ceiling. Everything after it is bounded by the number of conversations
 * somebody is in and runs in one pass, which is why it waits until the messages
 * are gone rather than racing them.
 */
export const purgeAuthor = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("byAuthor", (q) => q.eq("authorClerkId", clerkId))
      .take(BATCH);

    for (const message of messages) await ctx.db.delete(message._id);

    if (messages.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeAuthor, { clerkId });
      return { stage: "messages" as const, deleted: messages.length };
    }

    const memberships = await ctx.db
      .query("conversationMembers")
      .withIndex("byUser", (q) => q.eq("clerkId", clerkId))
      .take(BATCH);

    for (const member of memberships) {
      // A direct message with a deleted account has no other party. The whole
      // conversation goes — including the messages the *other* person sent,
      // which is why this is a purge rather than a delete of the two member
      // rows. Deleting the conversation and leaving their half of the thread
      // behind is how a table grows rows nothing can ever reach again.
      if (member.kind === "dm") {
        await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeConversation, {
          conversationId: member.conversationId,
        });
        continue;
      }

      // A group whose owner leaves this way still needs an owner, or it is a
      // room nobody can ever administer again. Oldest admin, then oldest
      // member — the same order `groups.leave` uses. With nobody left to take
      // it, the group is over and goes the same way a direct message does.
      if (member.kind === "group" && member.role === "owner") {
        const rest = await ctx.db
          .query("conversationMembers")
          .withIndex("byConversation", (q) =>
            q.eq("conversationId", member.conversationId).eq("status", "active"),
          )
          .collect();
        const heir = rest
          .filter((row) => row.clerkId !== clerkId)
          .sort((first, second) => {
            if (first.role !== second.role) return first.role === "admin" ? -1 : 1;
            return first.joinedAt - second.joinedAt;
          })[0];

        if (heir === undefined) {
          await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeConversation, {
            conversationId: member.conversationId,
          });
          continue;
        }
        await ctx.db.patch(heir._id, { role: "owner" });
      }

      // The global room is never purged — it is everybody's, and this account
      // leaving it is one row. Reaching here means `kind` is `global`, or a
      // group that still has somebody in it.
      await ctx.db.delete(member._id);
    }

    // More conversations than one pass could carry. The messages above are
    // already gone, so the next pass falls straight through to here.
    if (memberships.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeAuthor, { clerkId });
      return { stage: "memberships" as const, deleted: 0 };
    }

    for (const table of ["byUserA", "byUserB"] as const) {
      const rows = await ctx.db
        .query("friendships")
        .withIndex(table, (q) =>
          table === "byUserA" ? q.eq("userA", clerkId) : q.eq("userB", clerkId),
        )
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }

    const blocksMade = await ctx.db
      .query("blocks")
      .withIndex("byBlocker", (q) => q.eq("blocker", clerkId))
      .collect();
    const blocksReceived = await ctx.db
      .query("blocks")
      .withIndex("byBlocked", (q) => q.eq("blocked", clerkId))
      .collect();
    for (const row of [...blocksMade, ...blocksReceived]) {
      await ctx.db.delete(row._id);
    }

    // Reports they filed and reports filed against them. The second is the one
    // worth being deliberate about: a report is a record of an accusation, and
    // once the account it was about is gone there is nothing left for it to be
    // evidence of.
    const filed = await ctx.db
      .query("reports")
      .withIndex("byReporter", (q) => q.eq("reporterClerkId", clerkId))
      .collect();
    const against = await ctx.db
      .query("reports")
      .withIndex("byTarget", (q) => q.eq("targetClerkId", clerkId))
      .collect();
    for (const row of [...filed, ...against]) await ctx.db.delete(row._id);

    const strikes = await ctx.db
      .query("strikes")
      .withIndex("byUser", (q) => q.eq("clerkId", clerkId))
      .collect();
    for (const row of strikes) await ctx.db.delete(row._id);

    const profile = await ctx.db
      .query("chatProfiles")
      .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (profile !== null) await ctx.db.delete(profile._id);

    return { stage: "done" as const, deleted: messages.length };
  },
});
