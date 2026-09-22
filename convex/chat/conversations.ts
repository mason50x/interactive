import { BOT_ID, BOT_HANDLE, BOT_NAME, BOT_AVATAR } from "./botConfig";
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
  callerAccount,
  ensureDm,
  dmKeyFor,
  membership,
  accountFor,
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
  kind: "global" | "announcements" | "dm" | "group";
  /** The group's name. Absent for the other two, which the client names. */
  title?: string;
  lastMessageAt?: number;
  unread: number;
  favorite: boolean;
  lastReadAt: number;
  firstUnreadMessageId?: Id<"messages">;
  latestMessage?: {
    _id: Id<"messages">;
    _creationTime: number;
    authorClerkId: string;
    authorHandle: string;
    body: string;
  };
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
   * `@everyone` in the Everyone room. The row says so instead of its usual
   * subtitle.
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
): Promise<Doc<"messages">[]> {
  const rows = await ctx.db
    .query("messages")
    .withIndex("byConversationStatus", (q) =>
      q.eq("conversationId", conversationId).eq("status", "visible").gt("_creationTime", since),
    )
    .take(exact ? UNREAD_CAP : 1);
  return rows;
}




/**
 * Whether anything unread in a conversation names the caller.
 *
 * One bounded indexed read per target — the caller, and in the Everyone
 * room `@everyone` too — over the `mentions` table, from the reading
 * position forward. See that table in `convex/schema.ts` for why it exists
 * rather than this walking the messages. Not asked at all for a conversation
 * with nothing unread, which the caller settles first.
 */
async function mentionedIn(
  ctx: QueryCtx,
  member: Doc<"conversationMembers">,
): Promise<boolean> {
  const targets =
    member.kind === "global" ? [member.clerkId, EVERYONE] : [member.clerkId];
  for (const target of targets) {
    const rows = await ctx.db
      .query("mentions")
      .withIndex("byTargetConversation", (q) =>
        q
          .eq("target", target)
          .eq("conversationId", member.conversationId)
          .gt("_creationTime", member.lastReadAt),
      )
      .take(1);
    if (rows.length > 0) return true;
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
    const profile = await callerAccount(ctx);
    if (profile === null) return [];

    const members = await ctx.db
      .query("conversationMembers")
      .withIndex("byUser", (q) =>
        q.eq("clerkId", profile.clerkId).eq("status", "active"),
      )
      .take(MAX_CONVERSATIONS);

    // A favorite remains reachable even when it was created past the normal
    // inbox cap. Keep both indexed scans bounded and merge by membership id.
    const favorites = await ctx.db.query("conversationMembers")
      .withIndex("byUserFavorite", q => q.eq("clerkId", profile.clerkId).eq("status", "active").eq("favorite", true))
      .take(MAX_CONVERSATIONS);
    const seenMembers = new Set(members.map(member => member._id));
    for (const member of favorites) if (!seenMembers.has(member._id)) members.push(member);

    // Always include the pinned bot even when the regular inbox hits its cap.
    const botDm = await ctx.db.query("conversations")
      .withIndex("byDmKey", q => q.eq("dmKey", dmKeyFor(profile.clerkId, BOT_ID)))
      .unique();
    if (botDm && !members.some(member => member.conversationId === botDm._id)) {
      const botMember = await membership(ctx, botDm._id, profile.clerkId);
      if (botMember?.status === "active") members.push(botMember);
    }


    const summaries: ConversationSummary[] = [];
    for (const member of members) {
      const conversation = await ctx.db.get(member.conversationId);
      if (conversation === null) continue;

      const exact = member.kind !== "global";

      // The message timestamp is authoritative. lastMessageAt is the send
      // mutation's integer clock, while _creationTime may be fractional; a
      // manual unread cursor can sit between those two values.
      const latest = await ctx.db.query("messages")
        .withIndex("byConversationStatus", q => q.eq("conversationId", member.conversationId).eq("status", "visible"))
        .order("desc").first();
      const read = latest === null || latest._creationTime <= member.lastReadAt;

      const unreadRows = read
        ? []
        : await unreadFor(ctx, member.conversationId, member.lastReadAt, exact);
      const unread = unreadRows.length;

      // Only worth asking where there is something unread to be named in.
      // The room always is, by construction — and the read for it is one
      // row, invalidated by nothing but somebody naming the caller there.
      const mentioned =
        unread === 0 ? false : await mentionedIn(ctx, member);


      const firstUnread = unreadRows[0];

      let peerHandle: string | undefined;
      let peerName: string | undefined;
      let peerAvatar: Awaited<ReturnType<typeof avatarAppearance>> = {};
      if (member.dmPeer !== undefined) {
        const peer = await accountFor(ctx, member.dmPeer);
        peerHandle = member.dmPeer === BOT_ID ? BOT_HANDLE : peer?.handle;
        peerName = member.dmPeer === BOT_ID ? BOT_NAME : peer?.displayName;
        if (peer !== null) peerAvatar = await avatarAppearance(ctx, peer);
      }

      summaries.push({
        _id: conversation._id,
        kind: member.kind,
        title: conversation.title,
        lastMessageAt: conversation.lastMessageAt,
        unread,
        favorite: member.favorite ?? false,
        lastReadAt: member.lastReadAt,
        firstUnreadMessageId: firstUnread?._id,
        latestMessage: latest === null ? undefined : {
          _id: latest._id, _creationTime: latest._creationTime,
          authorClerkId: latest.authorClerkId, authorHandle: latest.authorHandle,
          body: latest.body.slice(0, 160) || (latest.images?.length ? "Photo" : "Message"),
        },
        unreadExact: exact,
        mentioned,
        peerClerkId: member.dmPeer,
        peerHandle,
        peerName,
        peerAvatarUrl: member.dmPeer === BOT_ID ? BOT_AVATAR : peerAvatar.avatarUrl,
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
      if (first.kind === "announcements") return -1;
      if (second.kind === "announcements") return 1;
      if (first.peerClerkId === BOT_ID) return -1;
      if (second.peerClerkId === BOT_ID) return 1;
      if (first.favorite !== second.favorite) return first.favorite ? -1 : 1;
      return (second.lastMessageAt ?? 0) - (first.lastMessageAt ?? 0);
    });
  },
});

export type OpenResult =
  | { ok: true; conversationId: Id<"conversations"> }
  | {
      ok: false;
      reason: "no-profile" | "unknown";
    };

/** Any signed-in account can start a private DM with another existing account. */
export const openDm = mutation({
  args: { peerClerkId: v.string() },
  handler: async (ctx, { peerClerkId }): Promise<OpenResult> => {
    const profile = await callerAccount(ctx);
    if (profile === null) return { ok: false, reason: "no-profile" };
    if (peerClerkId === profile.clerkId)
      return { ok: false, reason: "unknown" };

    if (peerClerkId === BOT_ID) {
      return { ok: true, conversationId: await ensureDm(ctx, profile.clerkId, BOT_ID) };
    }

    const peer = await accountFor(ctx, peerClerkId);
    if (peer === null) {
      return { ok: false, reason: "unknown" };
    }

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
    const profile = await callerAccount(ctx);
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
  kind: "global" | "announcements" | "dm" | "group";
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
    const profile = await callerAccount(ctx);
    if (profile === null) return null;

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") return null;

    const conversation = await ctx.db.get(conversationId);
    if (conversation === null) return null;

    let peerHandle: string | undefined;
    let peerName: string | undefined;
    let peerAvatar: Awaited<ReturnType<typeof avatarAppearance>> = {};
    if (member.dmPeer !== undefined) {
      const peer = await accountFor(ctx, member.dmPeer);
      peerHandle = member.dmPeer === BOT_ID ? BOT_HANDLE : peer?.handle;
      peerName = member.dmPeer === BOT_ID ? BOT_NAME : peer?.displayName;
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
      peerAvatarUrl: member.dmPeer === BOT_ID ? BOT_AVATAR : peerAvatar.avatarUrl,
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
    const profile = await callerAccount(ctx);
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
      const theirs = await accountFor(ctx, row.clerkId);
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
    const profile = await callerAccount(ctx);
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
  returns: v.null(),
  handler: async (ctx, { conversationId }) => {
    const profile = await callerAccount(ctx);
    if (profile === null) return null;
    const member = await membership(ctx, conversationId, profile.clerkId);
    // Active members only, the same bar `get` and `list` set: an invitation
    // or a removal is not a seat in the room, and a row in either state has
    // no reading position to move.
    if (member === null || member.status !== "active") return null;
    const latest = await ctx.db.query("messages")
      .withIndex("byConversationStatus", q => q.eq("conversationId", conversationId).eq("status", "visible"))
      .order("desc").first();
    // Creation times can include a fractional millisecond after the mutation's
    // fixed clock. Cover the newest visible message, not just Date.now().
    await ctx.db.patch(member._id, { lastReadAt: Math.max(member.lastReadAt, Date.now(), latest?._creationTime ?? 0) });
    return null;
  },
});

/** Favorites are private and do not change anybody else's conversation order. */
export const setFavorite = mutation({
  args: { conversationId: v.id("conversations"), favorite: v.boolean() },
  returns: v.boolean(),
  handler: async (ctx, { conversationId, favorite }) => {
    const profile = await callerAccount(ctx);
    if (profile === null) return false;
    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member?.status !== "active") return false;
    await ctx.db.patch(member._id, { favorite });
    return true;
  },
});

/** Put the latest visible message back behind the caller's reading position. */
export const markUnread = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.boolean(),
  handler: async (ctx, { conversationId }) => {
    const profile = await callerAccount(ctx);
    if (profile === null) return false;
    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member?.status !== "active") return false;
    const latest = await ctx.db.query("messages")
      .withIndex("byConversationStatus", q => q.eq("conversationId", conversationId).eq("status", "visible"))
      .order("desc").first();
    if (latest === null) return false;
    await ctx.db.patch(member._id, { lastReadAt: Math.min(member.lastReadAt, latest._creationTime - 0.001) });
    return true;
  },
});

/** Read once when entering a thread, before advancing its reading position. */
export const readPosition = query({
  args: { conversationId: v.id("conversations") },
  returns: v.union(v.null(), v.object({
    lastReadAt: v.number(), firstUnreadId: v.union(v.id("messages"), v.null()), firstUnreadAt: v.union(v.number(), v.null()),
  })),
  handler: async (ctx, { conversationId }) => {
    const profile = await callerAccount(ctx);
    if (profile === null) return null;
    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member?.status !== "active") return null;
    const first = await ctx.db.query("messages")
      .withIndex("byConversationStatus", q => q.eq("conversationId", conversationId).eq("status", "visible").gt("_creationTime", member.lastReadAt))
      .first();
    return { lastReadAt: member.lastReadAt, firstUnreadId: first?._id ?? null, firstUnreadAt: first?._creationTime ?? null };
  },
});
