import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import {
  blockedEitherWay,
  callerProfile,
  dmKeyFor,
  ensureDm,
  friendship,
  membership,
  pairOf,
  profileFor,
} from "./shared";

/**
 * Asking somebody if you may talk to them.
 *
 * This is the approval half of the feature, and on a site full of teenagers it
 * is doing more work than the friend lists it resembles. The default DM policy
 * is `friends`, so an accepted request is what turns a handle somebody found in
 * search into a private conversation — which means the answer to "can a
 * stranger message my child" is no, and it is no by default rather than after a
 * setting is found and changed.
 *
 * One row per pair, with `userA` the smaller Clerk id. See `friendships` in
 * `convex/schema.ts` for why that is one row and not two.
 */

/** The most requests or friends a panel will draw. */
const MAX_LIST = 200;

export type Friend = {
  clerkId: string;
  handle: string;
  avatarHue?: number;
  avatarEmoji?: string;
  avatarInitials?: string;
};

export type FriendRequest = {
  clerkId: string;
  handle: string;
  avatarHue?: number;
  avatarEmoji?: string;
  avatarInitials?: string;
  /** True when the caller sent it and is waiting on the other person. */
  outgoing: boolean;
  requestedAt: number;
};

/**
 * Put a new friend in both people's lists.
 *
 * Being friends is the moment a thread between two people is allowed to exist,
 * so it is also the moment the thread is made. Waiting for somebody to press
 * "message" meant an acceptance left no mark anywhere either person looks: the
 * list on the left was unchanged, and the new friend was only findable by
 * remembering to reopen the people panel and go looking for them. Two of these
 * can run for the same pair — both halves of a mutual request, say — and
 * `ensureDm` is idempotent for exactly that reason.
 *
 * `nobody` is the one policy this answers by doing nothing. Shutting the door
 * is a decision, and becoming friends is not a key to it: a thread neither
 * person may send in has no business sitting in either list. They still have
 * each other in Friends, and opening the door again is what `linkDms` below is
 * for — there is no "message" button to fall back on any more, so the policy
 * itself has to be what brings the threads back.
 */
async function linkDm(
  ctx: MutationCtx,
  mine: Doc<"chatProfiles">,
  theirs: Doc<"chatProfiles">,
): Promise<void> {
  if (mine.dmPolicy === "nobody" || theirs.dmPolicy === "nobody") return;
  await ensureDm(ctx, mine.clerkId, theirs.clerkId);
}

/**
 * Take the thread with them.
 *
 * A direct message now begins with a friendship and so it ends with one. The
 * alternative is a thread sitting in both lists that neither person may add to
 * and neither asked to keep — there is no "leave" on a direct message the way
 * there is on a group, so short of blocking somebody, which is a much bigger
 * thing to do than falling out with them, what unfriending left behind would
 * have stayed behind for good.
 *
 * All of it goes, including what the other person said. That is the part worth
 * being deliberate about: half a conversation, kept, is not what "remove" is
 * pressed for, and a thread with one side deleted is a monologue nobody
 * consented to keeping — the same argument `chat/erase.ts` makes about the
 * accounts it closes.
 *
 * The two membership rows are deleted here and synchronously, because they are
 * two documents and they are what the lists read: the thread leaves both feeds
 * in the same instant the friendship does, and `messages.send` stops accepting
 * anything into a conversation that is being taken apart underneath it. The
 * messages have no ceiling and are booked instead — `purgeConversation` in
 * `convex/chat/sweep.ts` is the one place a conversation is destroyed, and it
 * is written to be replayable against the state this leaves.
 */
async function unlinkDm(
  ctx: MutationCtx,
  clerkId: string,
  peerClerkId: string,
): Promise<void> {
  const conversation = await ctx.db
    .query("conversations")
    .withIndex("byDmKey", (q) => q.eq("dmKey", dmKeyFor(clerkId, peerClerkId)))
    .unique();
  if (conversation === null) return;

  for (const who of [clerkId, peerClerkId]) {
    const member = await membership(ctx, conversation._id, who);
    if (member !== null) await ctx.db.delete(member._id);
  }

  await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeConversation, {
    conversationId: conversation._id,
  });
}

export type RequestResult =
  | { ok: true; state: "sent" | "accepted" }
  | {
      ok: false;
      reason: "no-profile" | "unknown" | "blocked" | "already" | "closed" | "self";
    };

/**
 * Send a request, or accept one that was already waiting.
 *
 * The second case is the one worth having: two people who both press "add"
 * before either has looked at their requests should end up friends, not with
 * two rows and a puzzle. Because the pair is a single row, the second press
 * finds the first one's request and completes it.
 */
export const request = mutation({
  args: { peerClerkId: v.string() },
  handler: async (ctx, { peerClerkId }): Promise<RequestResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, reason: "no-profile" };
    if (profile.bannedAt !== undefined) return { ok: false, reason: "closed" };
    if (peerClerkId === profile.clerkId) return { ok: false, reason: "self" };

    const peer = await profileFor(ctx, peerClerkId);
    if (peer === null || peer.bannedAt !== undefined) {
      return { ok: false, reason: "unknown" };
    }
    if (await blockedEitherWay(ctx, profile.clerkId, peerClerkId)) {
      return { ok: false, reason: "blocked" };
    }

    const existing = await friendship(ctx, profile.clerkId, peerClerkId);
    if (existing !== null) {
      if (existing.status === "accepted") return { ok: false, reason: "already" };
      if (existing.requestedBy === profile.clerkId) {
        return { ok: false, reason: "already" };
      }
      await ctx.db.patch(existing._id, {
        status: "accepted",
        respondedAt: Date.now(),
      });
      await linkDm(ctx, profile, peer);
      return { ok: true, state: "accepted" };
    }

    await ctx.db.insert("friendships", {
      ...pairOf(profile.clerkId, peerClerkId),
      status: "pending",
      requestedBy: profile.clerkId,
      requestedAt: Date.now(),
    });
    return { ok: true, state: "sent" };
  },
});

/** Say yes. Only the person who did not ask can. */
export const accept = mutation({
  args: { peerClerkId: v.string() },
  handler: async (ctx, { peerClerkId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    if (profile.bannedAt !== undefined) return;

    // The same bars `request` sets, because an acceptance grants the same
    // thing a request asks for — a standing permission to open a direct
    // message. A pending row normally cannot outlive a block or a ban, but
    // "normally" is a claim about the other code paths, not about this one.
    const peer = await profileFor(ctx, peerClerkId);
    if (peer === null || peer.bannedAt !== undefined) return;
    if (await blockedEitherWay(ctx, profile.clerkId, peerClerkId)) return;

    const existing = await friendship(ctx, profile.clerkId, peerClerkId);
    if (existing === null || existing.status !== "pending") return;
    if (existing.requestedBy === profile.clerkId) return;

    await ctx.db.patch(existing._id, {
      status: "accepted",
      respondedAt: Date.now(),
    });
    await linkDm(ctx, profile, peer);
  },
});

/**
 * Say no, or take it back, or stop being friends.
 *
 * All three delete the row, because all three mean the same thing afterwards
 * and keeping a declined request would only be a record of a refusal for
 * somebody to go back and look at. Deleting also means the request can be sent
 * again later, which is the right answer for two people who fell out in March.
 *
 * Only the third takes a conversation with it, and only because only the third
 * ever had one. A request that was never accepted opened no thread, so a
 * declined one has nothing to clear up — and a pair whose thread predates the
 * friendship is exactly the case `dmPolicy: "anyone"` exists for, which is why
 * this asks what the row said rather than whether a thread happens to be there.
 */
export const remove = mutation({
  args: { peerClerkId: v.string() },
  handler: async (ctx, { peerClerkId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    const existing = await friendship(ctx, profile.clerkId, peerClerkId);
    if (existing === null) return;

    const friends = existing.status === "accepted";
    await ctx.db.delete(existing._id);
    if (friends) await unlinkDm(ctx, profile.clerkId, peerClerkId);
  },
});

/** Both sides of the pair index, merged, minus the caller. */
async function partnersOf(
  ctx: Parameters<typeof friendship>[0],
  clerkId: string,
  status: "pending" | "accepted",
): Promise<{ other: string; requestedBy: string; requestedAt: number }[]> {
  const asA = await ctx.db
    .query("friendships")
    .withIndex("byUserA", (q) => q.eq("userA", clerkId).eq("status", status))
    .take(MAX_LIST);
  const asB = await ctx.db
    .query("friendships")
    .withIndex("byUserB", (q) => q.eq("userB", clerkId).eq("status", status))
    .take(MAX_LIST);

  return [...asA, ...asB].map((row) => ({
    other: row.userA === clerkId ? row.userB : row.userA,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt,
  }));
}

export const list = query({
  args: {},
  handler: async (ctx): Promise<Friend[]> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return [];

    const partners = await partnersOf(ctx, profile.clerkId, "accepted");
    const friends: Friend[] = [];
    for (const partner of partners) {
      const theirs = await profileFor(ctx, partner.other);
      if (theirs === null || theirs.bannedAt !== undefined) continue;
      friends.push({
        clerkId: partner.other,
        handle: theirs.handle,
        avatarHue: theirs.avatarHue,
        avatarEmoji: theirs.avatarEmoji,
        avatarInitials: theirs.avatarInitials,
      });
    }
    return friends.sort((first, second) =>
      first.handle.localeCompare(second.handle),
    );
  },
});

/** Everything waiting, in both directions, newest first. */
export const pending = query({
  args: {},
  handler: async (ctx): Promise<FriendRequest[]> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return [];

    const partners = await partnersOf(ctx, profile.clerkId, "pending");
    const requests: FriendRequest[] = [];
    for (const partner of partners) {
      const theirs = await profileFor(ctx, partner.other);
      if (theirs === null || theirs.bannedAt !== undefined) continue;
      requests.push({
        clerkId: partner.other,
        handle: theirs.handle,
        avatarHue: theirs.avatarHue,
        avatarEmoji: theirs.avatarEmoji,
        avatarInitials: theirs.avatarInitials,
        outgoing: partner.requestedBy === profile.clerkId,
        requestedAt: partner.requestedAt,
      });
    }
    return requests.sort((first, second) => second.requestedAt - first.requestedAt);
  },
});

/** How many threads one backfill pass will make. */
const LINK_BATCH = 20;

/**
 * Give an account the threads its friendships already imply.
 *
 * One caller: `profiles.setDmPolicy`, when somebody turns `nobody` back off.
 * Every friendship made while the door was shut skipped `linkDm`, so without
 * this the friends collected during that time would sit in the Friends list
 * with no thread and no way to ask for one — the door would be open and the
 * room still gone.
 *
 * It terminates without a cursor, which is why it is written as "make some,
 * then look again" rather than as a page walk. Every pass either makes a thread
 * or reaches the end, and a thread made is one the next pass finds already
 * there — so the work left strictly shrinks and a pass that makes nothing books
 * nothing. The policy is re-read at the top of each pass for the same reason
 * `linkDm` checks it at all: it can be turned back off while this is running,
 * and the passes after that should stop.
 */
export const linkDms = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const mine = await profileFor(ctx, clerkId);
    if (mine === null || mine.bannedAt !== undefined) return { linked: 0 };
    if (mine.dmPolicy === "nobody") return { linked: 0 };

    const partners = await partnersOf(ctx, clerkId, "accepted");
    let linked = 0;

    for (const partner of partners) {
      if (linked === LINK_BATCH) {
        await ctx.scheduler.runAfter(0, internal.chat.friends.linkDms, {
          clerkId,
        });
        break;
      }

      const existing = await ctx.db
        .query("conversations")
        .withIndex("byDmKey", (q) =>
          q.eq("dmKey", dmKeyFor(clerkId, partner.other)),
        )
        .unique();
      if (existing !== null) continue;

      // The same bars `linkDm` clears on the way in. A friendship can outlive
      // neither a block nor a ban, but this is the one path that reaches a row
      // made at some other time under some other conditions.
      const theirs = await profileFor(ctx, partner.other);
      if (theirs === null || theirs.bannedAt !== undefined) continue;
      if (theirs.dmPolicy === "nobody") continue;
      if (await blockedEitherWay(ctx, clerkId, partner.other)) continue;

      await ensureDm(ctx, clerkId, partner.other);
      linked += 1;
    }

    return { linked };
  },
});
