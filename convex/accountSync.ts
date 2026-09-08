import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { action, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

type ClerkAccount = {
  id: string;
  username: string | null;
  first_name: string | null;
  image_url: string;
  updated_at: number;
};

async function fetchAccount(id: string): Promise<ClerkAccount> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY is not configured");
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) throw new Error(`Clerk account lookup failed (${response.status})`);
  const account = await response.json() as ClerkAccount;
  if (account.id !== id || !account.username) throw new Error("Clerk account needs a username");
  return account;
}

/** No client-provided identity fields: authenticate, then read Clerk directly. */
export const mine = action({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");
    const data = await fetchAccount(identity.subject);
    await ctx.runMutation(internal.users.upsertFromClerk, { data });
    return null;
  },
});

export const profilePage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ ids: v.array(v.string()), cursor: v.string(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("chatProfiles").paginate(args.paginationOpts);
    return { ids: page.page.map(p => p.clerkId), cursor: page.continueCursor, done: page.isDone };
  },
});

/** Preflight every account before applying; callers advance the returned cursor. */
export const backfill = internalAction({
  args: { cursor: v.union(v.string(), v.null()), dryRun: v.boolean() },
  returns: v.object({ checked: v.number(), updated: v.number(), cursor: v.string(), done: v.boolean() }),
  handler: async (ctx, args): Promise<{ checked: number; updated: number; cursor: string; done: boolean }> => {
    const page = await ctx.runQuery(internal.accountSync.profilePage, { paginationOpts: { cursor: args.cursor, numItems: 50 } });
    const accounts: ClerkAccount[] = [];
    for (const id of page.ids) accounts.push(await fetchAccount(id));
    if (!args.dryRun) {
      for (const data of accounts) await ctx.runMutation(internal.users.upsertFromClerk, { data });
    }
    return { checked: accounts.length, updated: args.dryRun ? 0 : accounts.length, cursor: page.cursor, done: page.done };
  },
});
