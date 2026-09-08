import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  AVATAR_EMOJI,
  AVATAR_HUES,
  GLOBAL_COOLDOWN_MS,
  MAX_INITIALS,
} from "../moderation/limits";
import { mutation, query } from "../_generated/server";
import {
  blockedEitherWay,
  avatarAppearance,
  callerId,
  callerProfile,
  dmKeyFor,
  ensureGlobalMembership,
  friendship,
  hasBlocked,
  membership,
  profileFor,
  senderRow,
  senderState,
} from "./shared";

/** Chat identity is managed by Clerk; only avatar style and privacy are chat settings. */

/** Everything the signed-in account is told about itself. */
export type MyProfile = {
  handle: string;
  displayName?: string;
  createdAt: number;
  /**
   * The instant this account may first speak in the global room.
   *
   * Sent as a timestamp rather than as a duration, and always — including long
   * after it has passed — because the client counts down to it against its own
   * clock. A field that went `undefined` once elapsed would only clear when
   * something else made this query re-run, and the one moment it has to be
   * right is the one where nothing else is happening.
   *
   * The length of the wait is not sent, because it does not need to be: it is
   * this minus `createdAt`, which is already here. So the rule stays in
   * `convex/moderation/limits.ts` and the client is handed an instant.
   */
  globalUnlockAt: number;
  dmPolicy: "friends" | "anyone" | "nobody";
  discoverable: boolean;
  /** Renames spent. The allowance itself is `MAX_HANDLE_CHANGES`. */
  handleChanges: number;
  avatarMode?: "account" | "custom";
  avatarHue?: number;
  avatarEmoji?: string;
  avatarInitials?: string;
  /** Direct Clerk account picture URL, when the account style is selected. */
  avatarUrl?: string;
  /**
   * How many messages this account has ever sent.
   *
   * It has always been on the row, feeding the trust tier and nothing else.
   * It comes out now because the settings panel says it back to you next to
   * your handle — the one number about yourself this app keeps, and one worth
   * seeing. Nobody else is ever told it: it is on `MyProfile` and deliberately
   * not on `PublicProfile`, because how much somebody talks is not a thing
   * strangers should be able to read off them.
  */
  messagesSent: number;
};

/** Public chat identity. Account emails and last names are never returned. */
export type PublicProfile = {
  clerkId: string;
  handle: string;
  displayName?: string;
  avatarHue?: number;
  avatarEmoji?: string;
  avatarInitials?: string;
  avatarUrl?: string;
};

export const mine = query({
  args: {},
  handler: async (ctx): Promise<MyProfile | null> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return null;

    const avatar = await avatarAppearance(ctx, profile);
    return {
      handle: profile.handle,
      displayName: profile.displayName,
      createdAt: profile.createdAt,
      globalUnlockAt: profile.createdAt + GLOBAL_COOLDOWN_MS,
      dmPolicy: profile.dmPolicy,
      discoverable: profile.discoverable,
      handleChanges: profile.handleChanges ?? 0,
      avatarMode: profile.avatarMode,
      ...avatar,
      // The sender's own row, not the profile — see `chatSenders` in
      // `convex/schema.ts`. `senderState` falls back to the profile for an
      // account that has not sent anything since the two moved apart.
      messagesSent: senderState(await senderRow(ctx, profile.clerkId), profile)
        .messagesSent,
    };
  },
});

/**
 * Find somebody by handle.
 *
 * The search index tokenises and prefix-matches the final term, which is
 * exactly a typeahead and nothing more — there is no way to enumerate the table
 * from here, because there is nothing to match against but a handle somebody
 * already has to be most of the way through typing.
 *
 * Filtered afterwards rather than in the index: `discoverable` and the block
 * list are both small reads and the alternative is declaring filter fields for
 * a query that returns at most a dozen rows.
 */
export const search = query({
  args: { term: v.string() },
  handler: async (ctx, { term }): Promise<PublicProfile[]> => {
    const clerkId = await callerId(ctx);
    if (clerkId === null) return [];

    const wanted = term.trim().toLowerCase();
    if (wanted.length < 2) return [];

    const hits = await ctx.db
      .query("chatProfiles")
      .withSearchIndex("searchHandle", (q) => q.search("handle", wanted))
      .take(20);

    const results: PublicProfile[] = [];
    for (const hit of hits) {
      if (hit.clerkId === clerkId) continue;
      if (!hit.discoverable) continue;
      if (await blockedEitherWay(ctx, clerkId, hit.clerkId)) continue;
      results.push({
        clerkId: hit.clerkId,
        handle: hit.handle,
        displayName: hit.displayName,
        ...(await avatarAppearance(ctx, hit)),
      });
    }
    return results;
  },
});

/**
 * Where the caller stands with one person, and what they may do about it.
 *
 * `none` is a stranger, `sent` is a request the caller is waiting on, `waiting`
 * is one waiting on the caller, and `friends` is the rest. `conversationId` is
 * the direct message the two already share, when the caller is still in it —
 * so a press on "Message" is a navigation when the thread exists and a call to
 * `conversations.openDm` when it does not.
 *
 * `canMessage` is the same answer `openDm` would give, worked out ahead of the
 * press so the card can say "add them first" instead of a refusal after the
 * fact. It discloses nothing `openDm` does not: a refused open already says
 * whether it was the policy or a block.
 */
export type PersonCard = {
  clerkId: string;
  handle: string;
  displayName?: string;
  avatarHue?: number;
  avatarEmoji?: string;
  avatarInitials?: string;
  avatarUrl?: string;
  standing: "none" | "sent" | "waiting" | "friends";
  /** The caller has blocked them. */
  blocked: boolean;
  /** Whether "Message" would go through right now. */
  canMessage: boolean;
  conversationId: Id<"conversations"> | null;
};

/**
 * One person, as the card that opens when their name is pressed.
 *
 * Asked only while a card is open — a thread of forty messages is not forty
 * subscriptions — and `null` for the caller themself, for an account that is
 * gone, and for anybody who has blocked the caller, all of which the card draws
 * as nothing rather than as a distinction worth explaining.
 */
export const card = query({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }): Promise<PersonCard | null> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return null;
    if (clerkId === profile.clerkId) return null;

    const theirs = await profileFor(ctx, clerkId);
    if (theirs === null) return null;
    if (await hasBlocked(ctx, clerkId, profile.clerkId)) return null;

    const blocked = await hasBlocked(ctx, profile.clerkId, clerkId);

    const row = await friendship(ctx, profile.clerkId, clerkId);
    const standing =
      row === null
        ? "none"
        : row.status === "accepted"
          ? "friends"
          : row.requestedBy === profile.clerkId
            ? "sent"
            : "waiting";

    let conversationId: Id<"conversations"> | null = null;
    const thread = await ctx.db
      .query("conversations")
      .withIndex("byDmKey", (q) =>
        q.eq("dmKey", dmKeyFor(profile.clerkId, clerkId)),
      )
      .unique();
    if (thread !== null) {
      const mine = await membership(ctx, thread._id, profile.clerkId);
      if (mine !== null && mine.status === "active")
        conversationId = thread._id;
    }

    const canMessage =
      !blocked &&
      theirs.dmPolicy !== "nobody" &&
      (theirs.dmPolicy === "anyone" || standing === "friends");

    return {
      clerkId,
      handle: theirs.handle,
      displayName: theirs.displayName,
      ...(await avatarAppearance(ctx, theirs)),
      standing,
      blocked,
      canMessage,
      conversationId,
    };
  },
});

export type AvatarResult =
  { ok: true } | { ok: false; reason: "no-profile" | "image" };

export const setAvatar = mutation({
  args: {
    hue: v.optional(v.number()),
    emoji: v.optional(v.string()),
    initials: v.optional(v.string()),
    mode: v.union(v.literal("account"), v.literal("custom")),
  },
  handler: async (
    ctx,
    { hue, emoji, initials, mode },
  ): Promise<AvatarResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, reason: "no-profile" };

    const wheel: readonly number[] = AVATAR_HUES;
    const nextHue = hue !== undefined && wheel.includes(hue) ? hue : undefined;

    const faces: readonly string[] = AVATAR_EMOJI;
    const nextEmoji =
      mode === "custom" && emoji !== undefined && faces.includes(emoji)
        ? emoji
        : undefined;

    // Only when there is no emoji: the disc has room for one thing, and an
    // emoji is the more deliberate of the two to have chosen. Same rule, same
    // order, as a group's face.
    const wanted = (initials ?? "").trim();
    const nextInitials =
      mode === "custom" &&
      nextEmoji === undefined &&
      wanted.length >= 1 &&
      wanted.length <= MAX_INITIALS &&
      /^[a-z0-9]+$/i.test(wanted)
        ? wanted
        : undefined;

    await ctx.db.patch(profile._id, {
      avatarMode: mode,
      avatarAttachmentId: undefined,
      avatarHue: nextHue,
      avatarEmoji: nextEmoji,
      avatarInitials: nextInitials,
    });
    return { ok: true };
  },
});

/**
 * Who may open a direct message with you.
 *
 * `nobody` is the only one of the three that changes what exists rather than
 * only what is allowed, because it is the one thing that stops a friendship
 * from opening a thread — see `linkDm` in `convex/chat/friends.ts`. Turning it
 * back off therefore has arrears to settle: every friend made while it was on
 * has no thread, and there is nothing anywhere for them to press to get one. So
 * the threads are booked here, immediately and out of line, because the number
 * of them is the number of friends and that is not a number a click should wait
 * on.
 */
export const setDmPolicy = mutation({
  args: {
    policy: v.union(
      v.literal("friends"),
      v.literal("anyone"),
      v.literal("nobody"),
    ),
  },
  handler: async (ctx, { policy }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    const reopening = profile.dmPolicy === "nobody" && policy !== "nobody";
    await ctx.db.patch(profile._id, { dmPolicy: policy });

    if (reopening) {
      await ctx.scheduler.runAfter(0, internal.chat.friends.linkDms, {
        clerkId: profile.clerkId,
      });
    }
  },
});

/** Whether handle search returns you at all. */
export const setDiscoverable = mutation({
  args: { discoverable: v.boolean() },
  handler: async (ctx, { discoverable }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    await ctx.db.patch(profile._id, { discoverable });
  },
});

/**
 * Make sure the caller is in the global room.
 *
 * Called by the provider on mount. Every account that claimed a handle before
 * the room existed, or that was in it and left, lands back in it here — which
 * is cheaper than a migration and correct for accounts that have not signed in
 * since.
 */
export const joinGlobal = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    await ensureGlobalMembership(ctx, profile.clerkId);
  },
});
