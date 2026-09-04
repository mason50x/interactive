import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { MAX_TITLE } from "../moderation/limits";
import { EVERYONE } from "../moderation/mentions";
import type { Refusal } from "../moderation/rules";
import { screenStatic } from "../moderation/verdict";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import {
  avatarAppearance,
  blockedBy,
  blockedEitherWay,
  callerProfile,
  ensureDm,
  friendship,
  membership,
  profileFor,
} from "./shared";

/**
 * The list on the left, and the three ways a conversation comes to exist.
 *
 * Direct messages are opened, groups are created, and the global room is simply
 * there — see `ensureGlobalRoom` in `convex/chat/shared.ts`. What they have in
 * common is a membership row, and the membership row is what every other query
 * in this directory actually works from.
 */

/** How many conversations the list will ever draw. */
const MAX_CONVERSATIONS = 50;

/**
 * How far back an unread count will look.
 *
 * Past this it says "99+", which is the same thing anybody reads it as. The cap
 * is what keeps the list a bounded amount of work: fifty conversations each
 * willing to scan a hundred messages is five thousand documents in the worst
 * case, and the worst case is somebody who has been away for a month.
 */
const UNREAD_CAP = 100;

export type ConversationSummary = {
  _id: Id<"conversations">;
  kind: "global" | "dm" | "group";
  /** The group's name. Absent for the other two, which the client names. */
  title?: string;
  lastMessageAt?: number;
  unread: number;
  /**
   * Whether `unread` is a count or a signal.
   *
   * False only for the global room, where counting would mean scanning
   * everything everybody said today every time any of it changed. The room gets
   * a dot instead, which is all a room of strangers warrants.
   */
  unreadExact: boolean;
  /**
   * Whether something unread in here names the caller — by handle, or with
   * `@everyone` in a group. The row says so instead of its usual subtitle.
   */
  mentioned: boolean;
  peerClerkId?: string;
  peerHandle?: string;
  /** The other person's display name, when they have one. */
  peerName?: string;
  peerAvatarUrl?: string;
  peerAvatarHue?: number;
  peerAvatarEmoji?: string;
  peerAvatarInitials?: string;
  role: "owner" | "admin" | "member";
  /** Groups only, and only once somebody has set one. See `conversations`. */
  emoji?: string;
  initials?: string;
  hue?: number;
};

async function unreadFor(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  since: number,
  exact: boolean,
): Promise<number> {
  const rows = await ctx.db
    .query("messages")
    .withIndex("byConversation", (q) =>
      q.eq("conversationId", conversationId).gt("_creationTime", since),
    )
    .take(exact ? UNREAD_CAP : 1);
  return rows.length;
}

/**
 * How many unread mentions are looked at before giving up on finding one
 * from somebody who is not blocked. Nearly always the first row is the
 * answer; this is only so that one blocked account naming the caller over
 * and over cannot hide a real mention behind it.
 */
const MENTION_SCAN = 5;

/**
 * Whether anything unread in a conversation names the caller.
 *
 * One bounded indexed read per target — the caller, and in a group
 * `@everyone` too — over the `mentions` table, from the reading position
 * forward. See that table in `convex/schema.ts` for why it exists rather
 * than this walking the messages. Not asked at all for a conversation with
 * nothing unread, which the caller settles first.
 */
async function mentionedIn(
  ctx: QueryCtx,
  member: Doc<"conversationMembers">,
  blocked: ReadonlySet<string>,
): Promise<boolean> {
  const targets =
    member.kind === "group" ? [member.clerkId, EVERYONE] : [member.clerkId];
  for (const target of targets) {
    const rows = await ctx.db
      .query("mentions")
      .withIndex("byTargetConversation", (q) =>
        q
          .eq("target", target)
          .eq("conversationId", member.conversationId)
          .gt("_creationTime", member.lastReadAt),
      )
      .take(MENTION_SCAN);
    if (rows.some((row) => !blocked.has(row.authorClerkId))) return true;
  }
  return false;
}

/**
 * Every conversation the caller is in, with the global room first.
 *
 * The order after that is by last message, which is why `lastMessageAt` is
 * written for direct messages and groups. The global room does not have one and
 * does not need one: it is pinned, so its position never depends on a field
 * that every message in it would have had to rewrite.
 */
export const list = query({
  args: {},
  handler: async (ctx): Promise<ConversationSummary[]> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return [];

    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("byUser", (q) =>
        q.eq("clerkId", profile.clerkId).eq("status", "active"),
      )
      .take(MAX_CONVERSATIONS);

    // For the mentions alone: a mention from somebody the caller has blocked
    // is not one. One read, and it only changes when the caller blocks.
    const blocked = await blockedBy(ctx, profile.clerkId);

    const summaries: ConversationSummary[] = [];
    for (const member of members) {
      const conversation = await ctx.db.get(member.conversationId);
      if (conversation === null) continue;

      const exact = member.kind !== "global";

      // Nothing has been said since it was last read, so there is nothing to
      // count and no reason to go and look. `lastMessageAt` is written by the
      // same mutation that inserts the message, so for a direct message or a
      // group the two numbers together are a complete answer, and this is the
      // state nearly every row in the list is in nearly all of the time — the
      // list is re-read on every message anybody sends into any of these
      // conversations, and without this each of those re-reads walked the
      // message index of all fifty.
      //
      // The global room has no `lastMessageAt` on purpose, so it always looks.
      // That is one document: it wants a dot, not a number.
      //
      // Strictly earlier, not "no later than", and the difference is real.
      // `lastMessageAt` is the `Date.now()` of the mutation that inserted the
      // message, but the message's own `_creationTime` is that instant plus a
      // fraction of a millisecond — so a row whose two numbers are equal is the
      // one case where a message exists that this comparison cannot see. It
      // happens on every send: the sender's own `lastReadAt` is written from the
      // same `now`. Equal means look.
      const read =
        conversation.lastMessageAt !== undefined &&
        conversation.lastMessageAt < member.lastReadAt;

      const unread = read
        ? 0
        : await unreadFor(ctx, member.conversationId, member.lastReadAt, exact);

      // Only worth asking where there is something unread to be named in.
      // The room always is, by construction — and the read for it is one
      // row, invalidated by nothing but somebody naming the caller there.
      const mentioned =
        unread === 0 ? false : await mentionedIn(ctx, member, blocked);

      let peerHandle: string | undefined;
      let peerName: string | undefined;
      let peerAvatar: Awaited<ReturnType<typeof avatarAppearance>> = {};
      if (member.dmPeer !== undefined) {
        const peer = await profileFor(ctx, member.dmPeer);
        peerHandle = peer?.handle;
        peerName = peer?.displayName;
        if (peer !== null) peerAvatar = await avatarAppearance(ctx, peer);
      }

      summaries.push({
        _id: conversation._id,
        kind: member.kind,
        title: conversation.title,
        lastMessageAt: conversation.lastMessageAt,
        unread,
        unreadExact: exact,
        mentioned,
        peerClerkId: member.dmPeer,
        peerHandle,
        peerName,
        peerAvatarUrl: peerAvatar.avatarUrl,
        peerAvatarHue: peerAvatar.avatarHue,
        peerAvatarEmoji: peerAvatar.avatarEmoji,
        peerAvatarInitials: peerAvatar.avatarInitials,
        role: member.role,
        emoji: conversation.emoji,
        initials: conversation.initials,
        hue: conversation.hue,
      });
    }

    return summaries.sort((first, second) => {
      if (first.kind === "global") return -1;
      if (second.kind === "global") return 1;
      return (second.lastMessageAt ?? 0) - (first.lastMessageAt ?? 0);
    });
  },
});

export type OpenResult =
  | { ok: true; conversationId: Id<"conversations"> }
  | {
      ok: false;
      reason: "no-profile" | "unknown" | "blocked" | "not-friends" | "closed";
    };

/**
 * Open a direct message, or find the one that is already open.
 *
 * The thread itself is `ensureDm`'s job, and it is idempotent — so this is the
 * gate rather than the construction. What is left here is the set of bars a
 * pair has to clear before a thread between them is allowed to exist at all.
 *
 * The default policy is `friends`, and this is where that becomes real: a
 * stranger cannot open a thread with you at all, so the friend request is the
 * gate rather than a formality that a determined person can walk around.
 *
 * Called from the person card — the one that opens when a name is pressed in a
 * thread, in search, or in the friends list — and it is where
 * `dmPolicy: "anyone"` becomes real: somebody who has opened their door can be
 * written to by a stranger, and somebody who has not gets a friend request
 * instead. Accepting a request builds the same thread — see `linkDm` in
 * `convex/chat/friends.ts` — so for friends this is nearly always a lookup.
 */
export const openDm = mutation({
  args: { peerClerkId: v.string() },
  handler: async (ctx, { peerClerkId }): Promise<OpenResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, reason: "no-profile" };
    if (peerClerkId === profile.clerkId)
      return { ok: false, reason: "unknown" };

    const peer = await profileFor(ctx, peerClerkId);
    if (peer === null) {
      return { ok: false, reason: "unknown" };
    }
    if (await blockedEitherWay(ctx, profile.clerkId, peerClerkId)) {
      return { ok: false, reason: "blocked" };
    }

    if (peer.dmPolicy === "nobody") return { ok: false, reason: "closed" };
    if (peer.dmPolicy === "friends") {
      const friends = await friendship(ctx, profile.clerkId, peerClerkId);
      if (friends === null || friends.status !== "accepted") {
        return { ok: false, reason: "not-friends" };
      }
    }

    // Usually already there: accepting a friend request builds the thread, so
    // by the time anybody presses "message" this is a lookup. See `linkDm` in
    // `convex/chat/friends.ts`.
    const conversationId = await ensureDm(ctx, profile.clerkId, peerClerkId);
    return { ok: true, conversationId };
  },
});

export type CreateResult =
  | { ok: true; conversationId: Id<"conversations"> }
  | { ok: false; reason: Refusal | "no-profile" };

/**
 * Make a group.
 *
 * The title goes through `screenStatic` rather than the message pipeline: it
 * has no sender history to check against, and no arrangement to read either,
 * because a name is not a thing said once in passing.
 */
export const createGroup = mutation({
  args: {
    title: v.string(),
    joinPolicy: v.union(
      v.literal("invite"),
      v.literal("request"),
      v.literal("open"),
    ),
  },
  handler: async (ctx, { title, joinPolicy }): Promise<CreateResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, reason: "no-profile" };
    const screened = screenStatic(title, MAX_TITLE);
    if (!screened.ok) return { ok: false, reason: screened.refusal };

    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      kind: "group",
      title: screened.text,
      createdBy: profile.clerkId,
      createdAt: now,
      lastMessageAt: now,
      joinPolicy,
    });

    await ctx.db.insert("conversationMembers", {
      conversationId,
      clerkId: profile.clerkId,
      kind: "group",
      role: "owner",
      status: "active",
      joinedAt: now,
      lastReadAt: now,
    });

    return { ok: true, conversationId };
  },
});

export type ConversationDetail = {
  _id: Id<"conversations">;
  kind: "global" | "dm" | "group";
  title?: string;
  joinPolicy?: "invite" | "request" | "open";
  role: "owner" | "admin" | "member";
  peerClerkId?: string;
  peerHandle?: string;
  peerName?: string;
  peerAvatarUrl?: string;
  peerAvatarHue?: number;
  peerAvatarEmoji?: string;
  peerAvatarInitials?: string;
  /** Groups only, and only once somebody has set one. See `conversations`. */
  emoji?: string;
  initials?: string;
  hue?: number;
};

export type ConversationMember = {
  clerkId: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  avatarHue?: number;
  avatarEmoji?: string;
  avatarInitials?: string;
  role: "owner" | "admin" | "member";
  status: "active" | "invited" | "requested";
};

/** How many members a panel will draw, and the ceiling on a group. */
const MAX_MEMBERS = 100;

/**
 * One conversation, as its own header describes it.
 *
 * Everything here is read from documents that belong to the caller or to the
 * conversation itself: their membership row by its exact key, the conversation,
 * and — for a direct message — the other person's profile. It touches nobody
 * else's row, which is the point of it being separate from `members` below.
 *
 * It used to return the member list too, and that made the thread header a
 * subscription to every membership row in the group. Those rows carry
 * `lastReadAt`, so every person reading the conversation wrote one on every
 * message — and each of those writes recomputed this query for every member
 * with the thread open, at a hundred rows and a hundred profiles a time. A
 * group of twenty people reading the same conversation was paying that four
 * hundred times per message for a list on a panel nobody had open.
 */
export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (
    ctx,
    { conversationId },
  ): Promise<ConversationDetail | null> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return null;

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") return null;

    const conversation = await ctx.db.get(conversationId);
    if (conversation === null) return null;

    let peerHandle: string | undefined;
    let peerName: string | undefined;
    let peerAvatar: Awaited<ReturnType<typeof avatarAppearance>> = {};
    if (member.dmPeer !== undefined) {
      const peer = await profileFor(ctx, member.dmPeer);
      peerHandle = peer?.handle;
      peerName = peer?.displayName;
      if (peer !== null) peerAvatar = await avatarAppearance(ctx, peer);
    }

    return {
      _id: conversation._id,
      kind: conversation.kind,
      title: conversation.title,
      joinPolicy: conversation.joinPolicy,
      role: member.role,
      peerClerkId: member.dmPeer,
      peerHandle,
      peerName,
      peerAvatarUrl: peerAvatar.avatarUrl,
      peerAvatarHue: peerAvatar.avatarHue,
      peerAvatarEmoji: peerAvatar.avatarEmoji,
      peerAvatarInitials: peerAvatar.avatarInitials,
      emoji: conversation.emoji,
      initials: conversation.initials,
      hue: conversation.hue,
    };
  },
});

/**
 * Who is in a group.
 *
 * Split off `get` because of what it costs to watch rather than what it costs
 * to run: it reads every membership row in the conversation, and those rows are
 * written by every reader on every message. Only the group panel draws this, so
 * only the group panel subscribes to it, and it is open for the seconds
 * somebody is looking at it rather than for as long as the thread is.
 *
 * Empty for the global room, and not because of a permission: everybody is in
 * it, so the list is both unbounded and uninformative, and reading it would be
 * the one query in this file whose cost grows with the size of the site.
 */
export const members = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }): Promise<ConversationMember[]> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return [];

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") return [];
    if (member.kind !== "group") return [];

    const rows = await ctx.db
      .query("conversationMembers")
      .withIndex("byConversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .take(MAX_MEMBERS);

    const people: ConversationMember[] = [];
    for (const row of rows) {
      if (row.status === "left" || row.status === "banned") continue;
      const theirs = await profileFor(ctx, row.clerkId);
      if (theirs === null) continue;
      people.push({
        clerkId: row.clerkId,
        handle: theirs.handle,
        displayName: theirs.displayName,
        ...(await avatarAppearance(ctx, theirs)),
        role: row.role,
        status: row.status,
      });
    }
    return people;
  },
});

export type ConversationPreview = {
  title: string;
  joinPolicy: "invite" | "request" | "open";
  members: number;
  /** Already asked, and waiting on somebody to decide. */
  requested: boolean;
};

/**
 * What somebody who is not in a group is allowed to see of it.
 *
 * This is the whole of group discovery, and it is deliberately no more than
 * this: there is no directory, no browse, no list of groups on the site. A
 * group is found because somebody sent you its link, which means the person
 * who let you in is a person rather than a search box — on a site whose users
 * are thirteen, a list of rooms full of strangers that anybody can walk into is
 * a feature with one obvious failure mode.
 *
 * Returns `null` for an invitation-only group, so a link to one tells the
 * holder nothing they did not already have. `banned` reads the same way: being
 * removed from a group should not leave a page that says so.
 */
export const preview = query({
  args: { conversationId: v.id("conversations") },
  handler: async (
    ctx,
    { conversationId },
  ): Promise<ConversationPreview | null> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return null;

    const conversation = await ctx.db.get(conversationId);
    if (conversation === null || conversation.kind !== "group") return null;
    if (conversation.joinPolicy === undefined) return null;
    if (conversation.joinPolicy === "invite") return null;

    const mine = await membership(ctx, conversationId, profile.clerkId);
    if (
      mine !== null &&
      (mine.status === "active" || mine.status === "banned")
    ) {
      return null;
    }

    const rows = await ctx.db
      .query("conversationMembers")
      .withIndex("byConversation", (q) =>
        q.eq("conversationId", conversationId).eq("status", "active"),
      )
      .take(MAX_MEMBERS);

    return {
      title: conversation.title ?? "Group",
      joinPolicy: conversation.joinPolicy,
      members: rows.length,
      requested: mine !== null && mine.status === "requested",
    };
  },
});

/**
 * Mark a conversation read up to now.
 *
 * Written on the caller's own membership row and nothing else, so two people
 * reading the same busy room at the same moment touch no document in common.
 */
export const markRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    const member = await membership(ctx, conversationId, profile.clerkId);
    // Active members only, the same bar `get` and `list` set: an invitation
    // or a removal is not a seat in the room, and a row in either state has
    // no reading position to move.
    if (member === null || member.status !== "active") return;
    await ctx.db.patch(member._id, { lastReadAt: Date.now() });
  },
});
