import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export async function timeoutRow(ctx: QueryCtx | MutationCtx, clerkId: string) {
  return ctx.db
    .query("userTimeouts")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

export async function activeTimeout(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
) {
  const row = await timeoutRow(ctx, clerkId);
  return row?.enabled && row.expiresAt > Date.now() ? row : null;
}

export async function requireNotTimedOut(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
) {
  if (await activeTimeout(ctx, clerkId))
    throw new ConvexError("You've been timed out. Contact an admin for help.");
}
