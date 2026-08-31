import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  blockedEitherWay,
  callerProfile,
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
  avatarHue?: number;
  avatarInitials?: string;
};

export type FriendRequest = {
  clerkId: string;
  handle: string;
  avatarHue?: number;
  avatarInitials?: string;
  /** True when the caller sent it and is waiting on the other person. */
  outgoing: boolean;
  requestedAt: number;
};

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

    const existing = await friendship(ctx, profile.clerkId, peerClerkId);
    if (existing === null || existing.status !== "pending") return;
    if (existing.requestedBy === profile.clerkId) return;

    await ctx.db.patch(existing._id, {
      status: "accepted",
      respondedAt: Date.now(),
    });
  },
});

/**
 * Say no, or take it back, or stop being friends.
 *
 * All three delete the row, because all three mean the same thing afterwards
 * and keeping a declined request would only be a record of a refusal for
 * somebody to go back and look at. Deleting also means the request can be sent
 * again later, which is the right answer for two people who fell out in March.
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
        avatarHue: theirs.avatarHue,
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
        avatarInitials: theirs.avatarInitials,
        outgoing: partner.requestedBy === profile.clerkId,
        requestedAt: partner.requestedAt,
      });
    }
    return requests.sort((first, second) => second.requestedAt - first.requestedAt);
  },
});
