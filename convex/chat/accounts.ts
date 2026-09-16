import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { accountFor, callerAccount, callerId, chatAccount, dmKeyFor, ensureGlobalMembership, membership, senderRow, type ChatAccount } from "./shared";

const accountFields = {
  clerkId: v.string(), handle: v.string(), displayName: v.optional(v.string()), avatarUrl: v.optional(v.string()),
};
export type PublicAccount = { clerkId: string; handle: string; displayName?: string; avatarUrl?: string };
export type MyAccount = PublicAccount & { createdAt: number; messagesSent: number };
export type PersonCard = PublicAccount & { conversationId: Id<"conversations"> | null };

function publicAccount(account: ChatAccount): PublicAccount {
  return { clerkId: account.clerkId, handle: account.handle, displayName: account.displayName, avatarUrl: account.imageUrl };
}

export const mine = query({
  args: {},
  returns: v.union(v.null(), v.object({ ...accountFields, createdAt: v.number(), messagesSent: v.number() })),
  handler: async (ctx): Promise<MyAccount | null> => {
    const account = await callerAccount(ctx);
    if (!account) return null;
    return { ...publicAccount(account), createdAt: account.createdAt, messagesSent: (await senderRow(ctx, account.clerkId))?.messagesSent ?? 0 };
  },
});

/** Every signed-in account can discover every other account, one bounded page at a time. */
export const directory = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(v.object(accountFields)), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { paginationOpts }) => {
    const clerkId = await callerId(ctx);
    if (!clerkId) return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db.query("users").withIndex("byUsernameKey").paginate({ ...paginationOpts, numItems: Math.min(50, Math.max(1, paginationOpts.numItems)) });
    return { page: result.page.flatMap(user => {
      const account = chatAccount(user);
      return account && account.clerkId !== clerkId ? [publicAccount(account)] : [];
    }), isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const search = query({
  args: { term: v.string() },
  returns: v.array(v.object(accountFields)),
  handler: async (ctx, { term }): Promise<PublicAccount[]> => {
    const clerkId = await callerId(ctx);
    if (!clerkId || term.trim().length < 2) return [];
    const users = await ctx.db.query("users").withSearchIndex("searchUsername", q => q.search("username", term.trim())).take(20);
    return users.flatMap(user => {
      const account = chatAccount(user);
      return account && account.clerkId !== clerkId ? [publicAccount(account)] : [];
    });
  },
});

export const card = query({
  args: { clerkId: v.string() },
  returns: v.union(v.null(), v.object({ ...accountFields, conversationId: v.union(v.id("conversations"), v.null()) })),
  handler: async (ctx, { clerkId }): Promise<PersonCard | null> => {
    const mine = await callerAccount(ctx);
    if (!mine || mine.clerkId === clerkId) return null;
    const account = await accountFor(ctx, clerkId);
    if (!account) return null;
    const dm = await ctx.db.query("conversations").withIndex("byDmKey", q => q.eq("dmKey", dmKeyFor(mine.clerkId, clerkId))).unique();
    const seat = dm ? await membership(ctx, dm._id, mine.clerkId) : null;
    return { ...publicAccount(account), conversationId: seat?.status === "active" ? dm!._id : null };
  },
});

export const joinGlobal = mutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const account = await callerAccount(ctx);
    if (account) await ensureGlobalMembership(ctx, account.clerkId);
    return null;
  },
});
