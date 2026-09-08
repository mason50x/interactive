import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, mutation, query, type QueryCtx } from "../_generated/server";
import { deleteMessage, membership } from "./shared";

import { isChatAdmin } from "../../config/chat-admin";

async function adminId(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !isChatAdmin(identity.subject)) return null;
  const user = await ctx.db.query("users")
    .withIndex("byClerkId", q => q.eq("clerkId", identity.subject)).unique();
  return user ? identity.subject : null;
}

export const mine = query({
  args: {},
  returns: v.boolean(),
  handler: async ctx => (await adminId(ctx)) !== null,
});

// Reports can grow without bound. Delete the message immediately and drain its
// reports in bounded transactions without retaining any message content.
export const clearReports = internalMutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const reports = await ctx.db.query("reports")
      .withIndex("byMessage", q => q.eq("messageId", messageId)).take(100);
    for (const report of reports) await ctx.db.delete(report._id);
    if (reports.length === 100) {
      await ctx.scheduler.runAfter(0, internal.chat.admin.clearReports, { messageId });
    }
    return null;
  },
});

export const remove = mutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const clerkId = await adminId(ctx);
    if (clerkId === null) throw new ConvexError("Admin access required.");
    const message = await ctx.db.get(messageId);
    if (message === null) return null;
    const member = await membership(ctx, message.conversationId, clerkId);
    if (member?.status !== "active") throw new ConvexError("Conversation access required.");
    await deleteMessage(ctx, message);
    await ctx.scheduler.runAfter(0, internal.chat.admin.clearReports, { messageId });
    return null;
  },
});
