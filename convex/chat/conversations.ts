import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { MAX_TITLE } from "../moderation/limits";
import type { Refusal } from "../moderation/rules";
import { screenStatic } from "../moderation/verdict";
import { mutation, query, type QueryCtx } from "../_generated/server";
import {
  blockedEitherWay,
  callerProfile,
  dmKeyFor,
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
  peerClerkId?: string;
  peerHandle?: string;
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

    const summaries: ConversationSummary[] = [];
    for (const member of members) {
      const conversation = await ctx.db.get(member.conversationId);
      if (conversation === null) continue;

      const exact = member.kind !== "global";
      const unread = await unreadFor(
        ctx,
        member.conversationId,
        member.lastReadAt,
        exact,
      );

      let peerHandle: string | undefined;
      if (member.dmPeer !== undefined) {
        const peer = await profileFor(ctx, member.dmPeer);
        peerHandle = peer?.handle;
      }

      summaries.push({
        _id: conversation._id,
        kind: member.kind,
        title: conversation.title,
        lastMessageAt: conversation.lastMessageAt,
        unread,
        unreadExact: exact,
        peerClerkId: member.dmPeer,
        peerHandle,
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
  | { ok: false; reason: "no-profile" | "unknown" | "blocked" | "not-friends" | "closed" };

/**
 * Open a direct message, or find the one that is already open.
 *
 * `dmKey` is what makes this idempotent — both people pressing the button at
 * the same moment land on the same row rather than on two half-built
 * conversations, because the key is derived from the pair rather than from who
 * asked first.
 *
 * The default policy is `friends`, and this is where that becomes real: a
 * stranger cannot open a thread with you at all, so the friend request is the
 * gate rather than a formality that a determined person can walk around.
 */
export const openDm = mutation({
  args: { peerClerkId: v.string() },
  handler: async (ctx, { peerClerkId }): Promise<OpenResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, reason: "no-profile" };
    if (profile.bannedAt !== undefined) return { ok: false, reason: "closed" };
    if (peerClerkId === profile.clerkId) return { ok: false, reason: "unknown" };

    const peer = await profileFor(ctx, peerClerkId);
    if (peer === null || peer.bannedAt !== undefined) {
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

    const dmKey = dmKeyFor(profile.clerkId, peerClerkId);
    const existing = await ctx.db
      .query("conversations")
      .withIndex("byDmKey", (q) => q.eq("dmKey", dmKey))
      .unique();

    if (existing !== null) {
      // Either side may have left; opening it again puts them back.
      for (const [who, other] of [
        [profile.clerkId, peerClerkId],
        [peerClerkId, profile.clerkId],
      ]) {
        const member = await membership(ctx, existing._id, who);
        if (member === null) {
          await ctx.db.insert("conversationMembers", {
            conversationId: existing._id,
            clerkId: who,
            kind: "dm",
            role: "member",
            status: "active",
            joinedAt: Date.now(),
            lastReadAt: 0,
            dmPeer: other,
          });
        } else if (member.status !== "active") {
          await ctx.db.patch(member._id, { status: "active" });
        }
      }
      return { ok: true, conversationId: existing._id };
    }

    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      kind: "dm",
      dmKey,
      createdBy: profile.clerkId,
      createdAt: now,
      lastMessageAt: now,
    });

    for (const [who, other] of [
      [profile.clerkId, peerClerkId],
      [peerClerkId, profile.clerkId],
    ]) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        clerkId: who,
        kind: "dm",
        role: "member",
        status: "active",
        joinedAt: now,
        lastReadAt: 0,
        dmPeer: other,
      });
    }

    return { ok: true, conversationId };
  },
});

export type CreateResult =
  | { ok: true; conversationId: Id<"conversations"> }
  | { ok: false; reason: Refusal | "no-profile" | "closed" };

/**
 * Make a group.
 *
 * The title goes through `screenStatic` rather than the message pipeline: it
 * has no sender history to check against, and tier-three words are refused here
 * rather than flagged, because a name is not a thing said once in passing.
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
    if (profile.bannedAt !== undefined) return { ok: false, reason: "closed" };
    if (profile.mutedUntil !== undefined && profile.mutedUntil > Date.now()) {
      return { ok: false, reason: "muted" };
    }

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
  members: {
    clerkId: string;
    handle: string;
    role: "owner" | "admin" | "member";
    status: "active" | "invited" | "requested";
  }[];
  /** Groups only, and only once somebody has set one. See `conversations`. */
  emoji?: string;
  initials?: string;
  hue?: number;
};

/** How many members a panel will draw, and the ceiling on a group. */
const MAX_MEMBERS = 100;

/**
 * One conversation, with its people.
 *
 * The member list is skipped entirely for the global room. Everybody is in it,
 * so the list is both unbounded and uninformative, and reading it would be the
 * one query in this file whose cost grows with the size of the site.
 */
export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }): Promise<ConversationDetail | null> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return null;

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") return null;

    const conversation = await ctx.db.get(conversationId);
    if (conversation === null) return null;

    let peerHandle: string | undefined;
    if (member.dmPeer !== undefined) {
      const peer = await profileFor(ctx, member.dmPeer);
      peerHandle = peer?.handle;
    }

    const members: ConversationDetail["members"] = [];
    if (conversation.kind === "group") {
      const rows = await ctx.db
        .query("conversationMembers")
        .withIndex("byConversation", (q) => q.eq("conversationId", conversationId))
        .take(MAX_MEMBERS);

      for (const row of rows) {
        if (row.status === "left" || row.status === "banned") continue;
        const theirs = await profileFor(ctx, row.clerkId);
        if (theirs === null) continue;
        members.push({
          clerkId: row.clerkId,
          handle: theirs.handle,
          role: row.role,
          status: row.status,
        });
      }
    }

    return {
      _id: conversation._id,
      kind: conversation.kind,
      title: conversation.title,
      joinPolicy: conversation.joinPolicy,
      role: member.role,
      peerClerkId: member.dmPeer,
      peerHandle,
      members,
      emoji: conversation.emoji,
      initials: conversation.initials,
      hue: conversation.hue,
    };
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
  handler: async (ctx, { conversationId }): Promise<ConversationPreview | null> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return null;

    const conversation = await ctx.db.get(conversationId);
    if (conversation === null || conversation.kind !== "group") return null;
    if (conversation.joinPolicy === undefined) return null;
    if (conversation.joinPolicy === "invite") return null;

    const mine = await membership(ctx, conversationId, profile.clerkId);
    if (mine !== null && (mine.status === "active" || mine.status === "banned")) {
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
    if (member === null) return;
    await ctx.db.patch(member._id, { lastReadAt: Date.now() });
  },
});
