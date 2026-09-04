import { v } from "convex/values";
import { GLOBAL_RETENTION_MS } from "../moderation/limits";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { clearSender, deleteAttachment, deleteMessage } from "./shared";

/**
 * The housekeeping, done in pieces small enough to finish.
 *
 * A Convex mutation gets one second. Each sweep therefore takes a fixed bite,
 * and if the bite came back full it books itself again for immediately
 * afterwards.
 */

/** How many rows one pass will touch. Well inside the second. */
const BATCH = 200;

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

    for (const message of old) await deleteMessage(ctx, message);

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
 * does not exist the claim is an id that resolves to nothing.
 */
export const purgeConversation = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("byConversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .take(BATCH);

    for (const message of messages) await deleteMessage(ctx, message);

    if (messages.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeConversation, {
        conversationId,
      });
      return { stage: "messages" as const, deleted: messages.length };
    }

    const reports = await ctx.db
      .query("reports")
      .withIndex("byConversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .take(BATCH);
    for (const report of reports) await ctx.db.delete(report._id);

    // Whoever was mid-sentence. Bounded by `MAX_TYPING`-ish in practice and
    // by the window in any case; the sweep below would take them within the
    // day, but a purged room should not leave anybody "typing" in it.
    const typing = await ctx.db
      .query("typing")
      .withIndex("byConversationUntil", (q) =>
        q.eq("conversationId", conversationId),
      )
      .collect();
    for (const row of typing) await ctx.db.delete(row._id);

    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("byConversation", (q) =>
        q.eq("conversationId", conversationId),
      )
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
 * Two callers reach this and one argument is the whole difference between them.
 * `users.deleteFromClerk` calls it in `account` mode, while
 * `chat.erase.eraseMine` calls it in `chat` mode.
 *
 * The other difference is what becomes of a group they own. An account leaving
 * Clerk hands its groups on, because a group is other people's and nobody asked
 * for it to close. Somebody clearing their own chat has asked for exactly that,
 * and is shown how many groups it is before they press it.
 *
 * `before` is the instant the erasure was asked for, and nothing made after it
 * is touched. Deleting the profile is what ends the ability to send and it
 * happens in the caller rather than here, so between that moment and this one a
 * new handle can be claimed — and the messages sent under it are not the ones
 * this was asked to delete. Without the cutoff this would follow the same Clerk
 * id straight into the new identity and start deleting from it.
 *
 * Scheduled rather than run inline by either caller. The webhook is a request
 * with a timeout on it, the button is a click waiting on a spinner, and this is
 * unbounded work either way — an account that talked a lot has an unbounded
 * number of messages. Convex guarantees a scheduled mutation runs exactly once,
 * so booking it is not a weaker guarantee than doing it, only a later one.
 *
 * Messages first and in batches, because that is the only part that has no
 * ceiling. Everything after it is bounded by the number of conversations
 * somebody is in and runs in one pass, which is why it waits until the messages
 * are gone rather than racing them.
 */
export const purgeAuthor = internalMutation({
  args: {
    clerkId: v.string(),
    /** Absent reads as `account`, which is what the Clerk webhook wants. */
    mode: v.optional(v.union(v.literal("account"), v.literal("chat"))),
    /** Absent reads as no cutoff, for the same reason. */
    before: v.optional(v.number()),
  },
  handler: async (ctx, { clerkId, mode, before }) => {
    const scope = mode ?? "account";
    const cutoff = before ?? Number.MAX_SAFE_INTEGER;
    /** The same arguments again, for whatever this pass does not finish. */
    const again = { clerkId, mode, before };

    const messages = await ctx.db
      .query("messages")
      .withIndex("byAuthor", (q) =>
        q.eq("authorClerkId", clerkId).lt("_creationTime", cutoff),
      )
      .take(BATCH);

    for (const message of messages) await deleteMessage(ctx, message);

    if (messages.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeAuthor, again);
      return { stage: "messages" as const, deleted: messages.length };
    }

    // Everything that named this account. The rows its own messages wrote
    // went with the messages above; these are the ones other people's
    // messages wrote about it, which nothing would ever read again — the
    // list only asks about conversations the caller is in — and which would
    // otherwise sit in the table for as long as the messages they belong to.
    const named = await ctx.db
      .query("mentions")
      .withIndex("byTargetConversation", (q) => q.eq("target", clerkId))
      .take(BATCH);
    for (const row of named) await ctx.db.delete(row._id);
    if (named.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeAuthor, again);
      return { stage: "mentions" as const, deleted: named.length };
    }

    const rows = await ctx.db
      .query("conversationMembers")
      .withIndex("byUser", (q) => q.eq("clerkId", clerkId))
      .take(BATCH);

    // `byUser` puts `status` ahead of `_creationTime`, so the cutoff cannot be
    // a range on the index and is applied here instead. The only rows it ever
    // excludes are ones made after the erasure was asked for — most likely the
    // global room, rejoined under a handle claimed in the meantime.
    const memberships = rows.filter((row) => row._creationTime < cutoff);

    for (const member of memberships) {
      // A direct message with a deleted account has no other party. The whole
      // conversation goes — including the messages the *other* person sent,
      // which is why this is a purge rather than a delete of the two member
      // rows. Deleting the conversation and leaving their half of the thread
      // behind is how a table grows rows nothing can ever reach again.
      //
      // The row goes first and the rest is booked. `purgeConversation` would
      // have deleted it too, but not until it had finished with the messages —
      // and a row still sitting in `byUser` when the next pass reads it is a
      // conversation this schedules a second purge for.
      if (member.kind === "dm") {
        await ctx.db.delete(member._id);
        await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeConversation, {
          conversationId: member.conversationId,
        });
        continue;
      }

      if (member.kind === "group" && member.role === "owner") {
        // Asked for, in so many words, and counted on screen first. See the
        // note above this mutation.
        if (scope === "chat") {
          await ctx.db.delete(member._id);
          await ctx.scheduler.runAfter(
            0,
            internal.chat.sweep.purgeConversation,
            {
              conversationId: member.conversationId,
            },
          );
          continue;
        }

        // A group whose owner leaves this way still needs an owner, or it is a
        // room nobody can ever administer again. Oldest admin, then oldest
        // member — the same order `groups.leave` uses. With nobody left to take
        // it, the group is over and goes the same way a direct message does.
        const rest = await ctx.db
          .query("conversationMembers")
          .withIndex("byConversation", (q) =>
            q
              .eq("conversationId", member.conversationId)
              .eq("status", "active"),
          )
          .collect();
        const heir = rest
          .filter((row) => row.clerkId !== clerkId)
          .sort((first, second) => {
            if (first.role !== second.role)
              return first.role === "admin" ? -1 : 1;
            return first.joinedAt - second.joinedAt;
          })[0];

        if (heir === undefined) {
          await ctx.db.delete(member._id);
          await ctx.scheduler.runAfter(
            0,
            internal.chat.sweep.purgeConversation,
            {
              conversationId: member.conversationId,
            },
          );
          continue;
        }
        await ctx.db.patch(heir._id, { role: "owner" });
      }

      // The global room is never purged — it is everybody's, and this account
      // leaving it is one row. Reaching here means `kind` is `global`, or a
      // group that still has somebody in it. The row is deleted rather than
      // marked `left`, because there is nothing left for it to remember.
      await ctx.db.delete(member._id);
    }

    // More conversations than one pass could carry. The messages above are
    // already gone, so the next pass falls straight through to here. Guarded on
    // having removed something, so that a page made entirely of rows past the
    // cutoff stops rather than booking itself forever.
    if (rows.length === BATCH && memberships.length > 0) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeAuthor, again);
      return { stage: "memberships" as const, deleted: 0 };
    }

    for (const table of ["byUserA", "byUserB"] as const) {
      const friendships = await ctx.db
        .query("friendships")
        .withIndex(table, (q) =>
          table === "byUserA" ? q.eq("userA", clerkId) : q.eq("userB", clerkId),
        )
        .collect();
      for (const row of friendships) await ctx.db.delete(row._id);
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

    // Every picture still owned directly by this account. The ones on messages
    // went with the messages above; these are unfinished uploads plus the
    // active profile picture. The general sweep would eventually find an
    // orphan, but an account erasure must remove its bytes immediately.
    for (const status of ["checking", "ready", "avatar"] as const) {
      const owned = await ctx.db
        .query("attachments")
        .withIndex("byOwner", (q) =>
          q.eq("ownerClerkId", clerkId).eq("status", status),
        )
        .collect();
      for (const row of owned) await deleteAttachment(ctx, row);
    }

    // Reports they filed and reports filed against them. Once the account a
    // report was about is gone there is nothing left for it to describe.
    const filed = await ctx.db
      .query("reports")
      .withIndex("byReporter", (q) => q.eq("reporterClerkId", clerkId))
      .collect();
    const against = await ctx.db
      .query("reports")
      .withIndex("byTarget", (q) => q.eq("targetClerkId", clerkId))
      .collect();
    for (const row of [...filed, ...against]) await ctx.db.delete(row._id);

    // Whoever was first through the door does not own the door.
    //
    // The global room is created lazily by whichever account happens to claim
    // the first handle, and `ensureGlobalRoom` has to put somebody in
    // `createdBy` because the schema has the field. Nothing reads it for the
    // global room — it is not a creator in any sense that matters, because the
    // room outlives every account in it and belongs to none of them. So it is
    // the one id about this person that would otherwise stay behind after
    // everything else went, stamped on a row that is never deleted. Cleared to
    // the empty string, which is what "nobody" looks like in a required field.
    const room = await ctx.db
      .query("conversations")
      .withIndex("byKind", (q) => q.eq("kind", "global"))
      .first();
    if (room !== null && room.createdBy === clerkId) {
      await ctx.db.patch(room._id, { createdBy: "" });
    }

    // `eraseMine` already dealt with the profile in `chat` mode. Account mode
    // reaches this directly from the Clerk deletion webhook and removes it here.
    if (scope === "account") {
      const profile = await ctx.db
        .query("chatProfiles")
        .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
        .unique();
      if (profile !== null) await ctx.db.delete(profile._id);

      // The sender row goes with the profile wherever the profile goes. See
      // `chatSenders` in `convex/schema.ts`.
      await clearSender(ctx, clerkId);
    }

    return { stage: "done" as const, deleted: messages.length };
  },
});

/**
 * Delete presence rows nobody has refreshed in a long time.
 *
 * Not for correctness — `chat.presence.count` already ignores anything outside
 * its window, so a row from last Tuesday is invisible whether or not this ever
 * runs. It is here because the table would otherwise keep one row per person
 * per conversation they have ever opened, forever, which is a table of dead
 * timestamps growing at the rate people look at things.
 *
 * An hour rather than the window itself. The window is what the count means and
 * it is measured in seconds; deleting on the same boundary would have this
 * fighting live heartbeats for no benefit, since a stale row costs nothing
 * until the day it is still there.
 */
const PRESENCE_TTL_MS = 60 * 60 * 1000;

export const sweepPresence = internalMutation({
  args: {},
  handler: async (ctx) => {
    const dead = await ctx.db
      .query("presence")
      .withIndex("bySeen", (q) =>
        q.lt("lastSeenAt", Date.now() - PRESENCE_TTL_MS),
      )
      .take(BATCH);

    for (const row of dead) await ctx.db.delete(row._id);

    if (dead.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.sweepPresence, {});
    }
    return dead.length;
  },
});

/**
 * Delete typing rows that stopped counting a long time ago.
 *
 * The same argument as `sweepPresence`, and even less load-bearing:
 * `chat.typing.who` reads only rows still inside their window, and the client
 * counts each one down on its own clock besides, so a row from last Tuesday
 * is invisible whether or not this ever runs. It is here because the table
 * would otherwise keep one row per person per conversation they have ever
 * typed in, and an hour past the window is generous by a factor of several
 * hundred.
 */
const TYPING_TTL_MS = 60 * 60 * 1000;

export const sweepTyping = internalMutation({
  args: {},
  handler: async (ctx) => {
    const dead = await ctx.db
      .query("typing")
      .withIndex("byUntil", (q) => q.lt("until", Date.now() - TYPING_TTL_MS))
      .take(BATCH);

    for (const row of dead) await ctx.db.delete(row._id);

    if (dead.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.sweepTyping, {});
    }
    return dead.length;
  },
});
