import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { deleteMessage, membership } from "./shared";

import { adminClerkIds, privilegesFor, staffRoles } from "../../config/roles";

export async function adminId(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !privilegesFor(identity.subject).deleteChatMessages) return null;
  const user = await ctx.db.query("users")
    .withIndex("byClerkId", q => q.eq("clerkId", identity.subject)).unique();
  return user ? identity.subject : null;
}

export const mine = query({
  args: {},
  returns: v.boolean(),
  handler: async ctx => (await adminId(ctx)) !== null,
});

/** Badges use the same server-owned role assignment as authorization. */
export const badges = query({
  args: {},
  returns: v.array(v.string()),
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db.query("users")
      .withIndex("byClerkId", q => q.eq("clerkId", identity.subject)).unique();
    return user ? adminClerkIds() : [];
  },
});

/** Staff presentation is separate from the caller's mutation capabilities. */
export const roles = query({
  args: {},
  returns: v.array(v.object({ clerkId: v.string(), role: v.union(v.literal("ceo"), v.literal("moderator")) })),
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db.query("users")
      .withIndex("byClerkId", q => q.eq("clerkId", identity.subject)).unique();
    return user ? staffRoles() : [];
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
    return null;
  },
});
