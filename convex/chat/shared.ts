import { activeTimeout } from "../timeoutState";
import { BOT_ID } from "./botConfig";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { RECENT_RING } from "../moderation/limits";

import type { RecentSend } from "../moderation/rules";



/** The caller's Clerk id, or `null` when signed out or timed out. */
export async function callerId(ctx: QueryCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity && !(await activeTimeout(ctx, identity.subject)) ? identity.subject : null;
}

/** A read-only view of the existing Clerk account mirror, never a second identity row. */
export type ChatAccount = Doc<"users"> & {
  handle: string;
  displayName?: string;
  createdAt: number;
};

export function chatAccount(user: Doc<"users"> | null): ChatAccount | null {
  if (!user?.username) return null;
  return { ...user, handle: user.username, displayName: user.firstName || user.username,
    createdAt: user.clerkCreatedAt ?? user._creationTime };
}

export async function accountFor(ctx: QueryCtx, clerkId: string): Promise<ChatAccount | null> {
  return chatAccount(await ctx.db.query("users").withIndex("byClerkId", q => q.eq("clerkId", clerkId)).unique());
}

export type AvatarAppearance = {
  avatarUrl?: string;
  avatarHue?: number;
  avatarEmoji?: string;
  avatarInitials?: string;
};

export async function avatarAppearance(_ctx: QueryCtx, account: ChatAccount): Promise<AvatarAppearance> {
  return { avatarUrl: account.imageUrl };
}

export async function accountByHandle(ctx: QueryCtx, handle: string): Promise<ChatAccount | null> {
  return chatAccount(await ctx.db.query("users").withIndex("byUsernameKey", q => q.eq("usernameKey", handle.toLowerCase())).unique());
}

export async function callerAccount(ctx: QueryCtx): Promise<ChatAccount | null> {
  const clerkId = await callerId(ctx);
  return clerkId === null ? null : await accountFor(ctx, clerkId);
}

export type SenderState = { messagesSent: number; recent: RecentSend[] };

export async function senderRow(ctx: QueryCtx, clerkId: string): Promise<Doc<"chatSenders"> | null> {
  return await ctx.db.query("chatSenders").withIndex("byClerkId", q => q.eq("clerkId", clerkId)).unique();
}

export function senderState(row: Doc<"chatSenders"> | null): SenderState {
  return { messagesSent: row?.messagesSent ?? 0, recent: row?.recent ?? [] };
}

/**
 * Drop the sender row, if there is one.
 *
 * Called wherever a profile is deleted or emptied. The two are one identity and
 * they end together: a ring left behind is a rate limit applied to whoever
 * claims the handle next, and a surviving `messagesSent` is the trust tier of an
 * account that no longer exists.
 */
export async function clearSender(
  ctx: MutationCtx,
  clerkId: string,
): Promise<void> {
  const row = await senderRow(ctx, clerkId);
  if (row !== null) await ctx.db.delete(row._id);
}

/**
 * Push one send onto the ring, dropping the oldest.
 *
 * Twenty entries, oldest first out. Every cross-message rule in
 * `convex/moderation/rules.ts` reads this array and none of them looks further
 * back than ten minutes, so twenty is generous even for somebody sending as
 * fast as the rate limit allows.
 */
export function pushRecent(
  recent: RecentSend[],
  send: RecentSend,
): RecentSend[] {
  const next = [...recent, send];
  return next.length <= RECENT_RING
    ? next
    : next.slice(next.length - RECENT_RING);
}

/**
 * Delete one uploaded picture: the file and the row that owns it.
 *
 * Both, always, and in this order. The row is what the sweep uses to tell a
 * held file from an orphan — see `attachments` in `convex/schema.ts` — so a
 * row that outlived its file would be a claim on nothing, and a file that
 * outlived its row would be swept anyway an hour later. Taking both here
 * means neither state exists long enough to matter.
 *
 * The file is looked up before it is deleted, because a deletion that has
 * already happened is not an error here: a message and a sweep can both
 * reasonably decide the same picture is finished.
 */
export async function deleteAttachment(
  ctx: MutationCtx,
  row: Doc<"attachments">,
): Promise<void> {
  const file = await ctx.db.system.get("_storage", row.storageId);
  if (file !== null) await ctx.storage.delete(row.storageId);
  await ctx.db.delete(row._id);
}

/**
 * Delete a message, and every picture that was on it.
 *
 * The single way a message with pictures leaves the table. Four callers
 * reach it — the author taking it back, the global room's monthly trim, a
 * conversation being purged, and an account being purged — and before this
 * existed each of them deleted the row directly, which was fine for as long
 * as a row was all a message was. A picture is a file in storage, and a file
 * whose message has gone is a file nothing can ever find again: it is not in
 * any thread, and the sweep only reclaims files no *sent* row is holding.
 *
 * So the pictures go first, through `deleteAttachment` above, and the row
 * last. A message without pictures costs exactly what it did.
 *
 * The mention rows go the same way, for the same reason: a row that says
 * "this message named you" about a message that no longer exists would keep
 * a conversation saying "mentioned you" about nothing.
 */
export async function deleteMessage(
  ctx: MutationCtx,
  message: Doc<"messages">,
): Promise<void> {
  await clearMentions(ctx, message._id);
  for (const image of message.images ?? []) {
    const row = await ctx.db.get(image.attachmentId);
    if (row !== null) {
      await deleteAttachment(ctx, row);
      continue;
    }
    // A file with no row, which nothing should leave behind. Taken anyway,
    // because it is the file that costs money and the row that was only ever
    // a pointer to it.
    const file = await ctx.db.system.get("_storage", image.storageId);
    if (file !== null) await ctx.storage.delete(image.storageId);
  }
  await ctx.db.delete(message._id);
}

/**
 * Take back what a message said about who it named.
 *
 * Called when the message goes — a hidden message
 * draws as a gap in the thread, and a gap should not be lighting anybody's
 * list up. Nothing is written on the message itself: its own `mentions` stay
 * as the record of what it said, and the thread empties a hidden body anyway.
 */
export async function clearMentions(
  ctx: MutationCtx,
  messageId: Id<"messages">,
): Promise<void> {
  const rows = await ctx.db
    .query("mentions")
    .withIndex("byMessage", (q) => q.eq("messageId", messageId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

/**
 * Drop somebody's "typing" row for a conversation, if there is one.
 *
 * Reached from `typing.stop`, from a send — so the dots go in the same
 * transaction that puts the message on screen — and from the purges, so a
 * conversation or an account does not leave a row behind that says it is
 * still writing. Already gone is not an error: a stop and a send can both
 * reasonably decide the same row is finished.
 */
export async function clearTyping(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  clerkId: string,
): Promise<void> {
  const row = await ctx.db
    .query("typing")
    .withIndex("byConversationUser", (q) =>
      q.eq("conversationId", conversationId).eq("clerkId", clerkId),
    )
    .unique();
  if (row !== null) await ctx.db.delete(row._id);
}

/** The two ids in a stable order, which is what makes a pair one row. */
export function pairOf(a: string, b: string): { userA: string; userB: string } {
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

export function dmKeyFor(a: string, b: string): string {
  const { userA, userB } = pairOf(a, b);
  return `${userA}|${userB}`;
}

export async function membership(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  clerkId: string,
): Promise<Doc<"conversationMembers"> | null> {
  return await ctx.db
    .query("conversationMembers")
    .withIndex("byConversationUser", (q) =>
      q.eq("conversationId", conversationId).eq("clerkId", clerkId),
    )
    .unique();
}

/**
 * The one global room, created if it is not there yet.
 *
 * Lazily rather than seeded, because a seed is a migration and this is a row
 * that either exists or is one insert away from existing. The `byKind` index
 * makes finding it a single lookup, which is why there is no table holding its
 * id.
 */
export async function ensureGlobalRoom(
  ctx: MutationCtx,
  clerkId: string,
): Promise<Id<"conversations">> {
  const existing = await ctx.db
    .query("conversations")
    .withIndex("byKind", (q) => q.eq("kind", "global"))
    .first();
  if (existing !== null) return existing._id;

  return await ctx.db.insert("conversations", {
    kind: "global",
    createdBy: clerkId,
    createdAt: Date.now(),
  });
}

/** Ensure all default conversations, including for existing accounts. */
export async function ensureGlobalMembership(
  ctx: MutationCtx,
  clerkId: string,
): Promise<Id<"conversations">> {
  const announcementRoom = await ctx.db.query("conversations")
    .withIndex("byKind", q => q.eq("kind", "announcements")).unique();
  const announcementId = announcementRoom?._id ?? await ctx.db.insert("conversations", {
    kind: "announcements", createdBy: "", createdAt: Date.now(),
  });
  const announcementMember = await membership(ctx, announcementId, clerkId);
  if (announcementMember === null) {
    await ctx.db.insert("conversationMembers", {
      conversationId: announcementId, clerkId, kind: "announcements",
      role: "member", status: "active", joinedAt: Date.now(), lastReadAt: 0,
    });
  } else if (announcementMember.status !== "active") {
    await ctx.db.patch(announcementMember._id, { status: "active" });
  }
  await ensureDm(ctx, clerkId, BOT_ID);
  const conversationId = await ensureGlobalRoom(ctx, clerkId);
  const existing = await membership(ctx, conversationId, clerkId);
  if (existing !== null) {
    if (existing.status !== "active") {
      await ctx.db.patch(existing._id, { status: "active" });
    }
    return conversationId;
  }

  await ctx.db.insert("conversationMembers", {
    conversationId,
    clerkId,
    kind: "global",
    role: "member",
    status: "active",
    joinedAt: Date.now(),
    lastReadAt: 0,
  });
  return conversationId;
}


export async function ensureDm(
  ctx: MutationCtx,
  clerkId: string,
  peerClerkId: string,
): Promise<Id<"conversations">> {
  const dmKey = dmKeyFor(clerkId, peerClerkId);
  const now = Date.now();

  const existing = await ctx.db
    .query("conversations")
    .withIndex("byDmKey", (q) => q.eq("dmKey", dmKey))
    .unique();

  const conversationId =
    existing?._id ??
    (await ctx.db.insert("conversations", {
      kind: "dm",
      dmKey,
      createdBy: clerkId,
      createdAt: now,
      lastMessageAt: now,
    }));

  // Either side may have left; opening it again puts them back.
  for (const [who, other] of [
    [clerkId, peerClerkId],
    [peerClerkId, clerkId],
  ]) {
    if (who === BOT_ID) continue;
    const member = await membership(ctx, conversationId, who);
    if (member === null) {
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
    } else if (member.status !== "active") {
      await ctx.db.patch(member._id, { status: "active" });
    }
  }

  return conversationId;
}
