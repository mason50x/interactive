import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { resolvePrivileges, resolveRole, type SiteRole } from "../roles";
import { staffId } from "./admin";
import { accountByHandle, callerId, deleteMessage, membership } from "./shared";

/**
 * Staff controls for the Everyone room: lock it, slow it down, and delete
 * recent messages in bulk.
 *
 * Moderators and above only, the same people who can delete one message
 * (`staffId`). The Everyone room only: groups have owners and admins of
 * their own, and a direct message has nobody to moderate it.
 *
 * Staff are exempt from their own lock and slow mode, because the reason to
 * lock a room is usually to say something in it.
 */

/** The slow-mode intervals a moderator can pick. 0 is off. */
export const SLOW_MODE_SECONDS = [0, 5, 10, 30, 60, 300] as const;

/** How many recent messages one bulk delete may remove. */
export const BULK_DELETE_MAX = 100;

/** How far back a delete filtered to one person looks through their messages. */
const AUTHOR_SCAN_LIMIT = 1000;

/** A moderator may clear a builder or a member, never somebody above them. */
const RANK: Record<SiteRole, number> = {
  member: 0,
  builder: 1,
  moderator: 1,
  head_moderator: 2,
  ceo: 3,
};

export type RoomControls = { locked: boolean; slowModeSeconds: number };

const OFF: RoomControls = { locked: false, slowModeSeconds: 0 };

const controlsValidator = v.object({
  locked: v.boolean(),
  slowModeSeconds: v.number(),
});

export async function controlsRow(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<Doc<"roomControls"> | null> {
  return await ctx.db
    .query("roomControls")
    .withIndex("byConversation", (q) => q.eq("conversationId", conversationId))
    .unique();
}

/**
 * Whether the sender is held back by the room's controls, and by which one.
 *
 * Called from the send path for the Everyone room only. Reads nothing more
 * when both controls are off, which is nearly always. `recent` is the
 * sender's own ring from `chatSenders`, which already records where and when
 * each of their last sends went.
 */
export async function roomControlRefusal(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  clerkId: string,
  recent: { at: number; conversationId: string }[],
  now: number,
): Promise<"locked" | "slow-mode" | null> {
  const row = await controlsRow(ctx, conversationId);
  if (row === null || (!row.locked && row.slowModeSeconds <= 0)) return null;
  if ((await resolvePrivileges(ctx, clerkId)).deleteChatMessages) return null;
  if (row.locked) return "locked";
  const since = now - row.slowModeSeconds * 1000;
  return recent.some(
    (send) => send.conversationId === conversationId && send.at > since,
  )
    ? "slow-mode"
    : null;
}

/** Whether a room's lock stops this person editing their messages in it. */
export async function lockedFor(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  clerkId: string,
): Promise<boolean> {
  const row = await controlsRow(ctx, conversationId);
  return (
    row !== null &&
    row.locked &&
    !(await resolvePrivileges(ctx, clerkId)).deleteChatMessages
  );
}

/** A moderator acting in the Everyone room, or an error. */
async function requireRoomModerator(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<string> {
  const clerkId = await staffId(ctx);
  if (clerkId === null) throw new ConvexError("Moderator access required.");
  const member = await membership(ctx, conversationId, clerkId);
  if (member?.status !== "active" || member.kind !== "global") {
    throw new ConvexError("Room controls are only for the Everyone room.");
  }
  return clerkId;
}

/** The room's current controls, for anybody in the room to see. */
export const get = query({
  args: { conversationId: v.id("conversations") },
  returns: controlsValidator,
  handler: async (ctx, { conversationId }) => {
    const clerkId = await callerId(ctx);
    if (clerkId === null) return OFF;
    const member = await membership(ctx, conversationId, clerkId);
    if (member?.status !== "active" || member.kind !== "global") return OFF;
    const row = await controlsRow(ctx, conversationId);
    return row === null
      ? OFF
      : { locked: row.locked, slowModeSeconds: row.slowModeSeconds };
  },
});

/** Change the lock, the slow mode, or both. Omitted fields stay as they are. */
export const set = mutation({
  args: {
    conversationId: v.id("conversations"),
    locked: v.optional(v.boolean()),
    slowModeSeconds: v.optional(v.number()),
  },
  returns: controlsValidator,
  handler: async (ctx, { conversationId, locked, slowModeSeconds }) => {
    await requireRoomModerator(ctx, conversationId);
    if (
      slowModeSeconds !== undefined &&
      !(SLOW_MODE_SECONDS as readonly number[]).includes(slowModeSeconds)
    ) {
      throw new ConvexError("Choose one of the slow mode options.");
    }
    const row = await controlsRow(ctx, conversationId);
    const next: RoomControls = {
      locked: locked ?? row?.locked ?? false,
      slowModeSeconds: slowModeSeconds ?? row?.slowModeSeconds ?? 0,
    };
    const data = { ...next, updatedAt: Date.now() };
    if (row === null) {
      await ctx.db.insert("roomControls", { conversationId, ...data });
    } else {
      await ctx.db.patch(row._id, data);
    }
    return next;
  },
});

/**
 * Delete the room's most recent messages, optionally only one person's.
 *
 * Messages from staff ranked above the caller are left in place and counted
 * as skipped, so a moderator's cleanup never removes a CEO's notice.
 */
export const bulkDelete = mutation({
  args: {
    conversationId: v.id("conversations"),
    count: v.number(),
    handle: v.optional(v.string()),
  },
  returns: v.object({ deleted: v.number(), skipped: v.number() }),
  handler: async (ctx, { conversationId, count, handle }) => {
    const callerClerkId = await requireRoomModerator(ctx, conversationId);
    if (!Number.isInteger(count) || count < 1 || count > BULK_DELETE_MAX) {
      throw new ConvexError(
        `Choose between 1 and ${BULK_DELETE_MAX} messages.`,
      );
    }

    let messages: Doc<"messages">[];
    const wanted = handle?.trim().replace(/^@/, "");
    if (wanted) {
      const author = await accountByHandle(ctx, wanted);
      if (author === null) throw new ConvexError(`No one goes by @${wanted}.`);
      messages = [];
      let scanned = 0;
      for await (const message of ctx.db
        .query("messages")
        .withIndex("byAuthor", (q) => q.eq("authorClerkId", author.clerkId))
        .order("desc")) {
        if (++scanned > AUTHOR_SCAN_LIMIT) break;
        if (message.conversationId !== conversationId) continue;
        messages.push(message);
        if (messages.length === count) break;
      }
    } else {
      messages = await ctx.db
        .query("messages")
        .withIndex("byConversation", (q) =>
          q.eq("conversationId", conversationId),
        )
        .order("desc")
        .take(count);
    }

    const callerRank = RANK[await resolveRole(ctx, callerClerkId)];
    const ranks = new Map<string, number>();
    let deleted = 0;
    let skipped = 0;
    for (const message of messages) {
      let rank = ranks.get(message.authorClerkId);
      if (rank === undefined) {
        rank = RANK[await resolveRole(ctx, message.authorClerkId)];
        ranks.set(message.authorClerkId, rank);
      }
      if (rank > callerRank) {
        skipped += 1;
        continue;
      }
      await deleteMessage(ctx, message);
      deleted += 1;
    }
    return { deleted, skipped };
  },
});
