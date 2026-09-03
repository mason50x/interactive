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
  displayName?: string;
  avatarHue?: number;
  avatarEmoji?: string;
  avatarInitials?: string;
};

export type FriendRequest = {
  clerkId: string;
  handle: string;
  displayName?: string;
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
 * Accepting is the moment a thread between two people is allowed to exist, so
 * it is also the moment the thread is made: an acceptance that left no mark in
 * the list on the left was an acceptance the new friend had to go looking for.
 * Two of these can run for the same pair — both halves of a mutual request, say
 * — and `ensureDm` is idempotent for exactly that reason. It is the same thread
 * a press on "Message" would open, so the two never disagree.
 *
 * `nobody` is the one policy this answers by doing nothing. Shutting the door
 * is a decision, and becoming friends is not a key to it: a thread neither
 * person may send in has no business sitting in either list. They still have
 * each other in Friends, and opening the door again is what `linkDms` below is
 * for.
 */
async function linkDm(
  ctx: MutationCtx,
  mine: Doc<"chatProfiles">,
  theirs: Doc<"chatProfiles">,
): Promise<void> {
  if (mine.dmPolicy === "nobody" || theirs.dmPolicy === "nobody") return;
  await ensureDm(ctx, mine.clerkId, theirs.clerkId);
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
 * None of them touches a conversation. Unfriending used to delete the direct
 * message and everything in it, for both people, and that was the wrong size
 * of consequence for the button it sat behind: "remove friend" is pressed to
 * tidy a list, and what it took was two people's history. The thread stays,
 * the way it does everywhere else people chat. What a friendship still decides
 * is whether a *new* thread may be opened — see `openDm` in
 * `convex/chat/conversations.ts` — and ending one is what blocking is for,
 * which marks the thread rather than destroying it. See `convex/chat/blocks.ts`.
 */
export const remove = mutation({
  args: { peerClerkId: v.string() },
  handler: async (ctx, { peerClerkId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    const existing = await friendship(ctx, profile.clerkId, peerClerkId);
    if (existing === null) return;

    await ctx.db.delete(existing._id);
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
        displayName: theirs.displayName,
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
        displayName: theirs.displayName,
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
