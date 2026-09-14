import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * Who is calling, and their row in `users`.
 *
 * Every module that gates on identity used to spell this pair out for itself:
 * read the Clerk subject off the request, then look the account up by it.
 * The lookups were identical and only the refusals differed, so the lookups
 * live here and each caller keeps its own words for the refusal. A mutation
 * context is accepted wherever a query context is: it reads the same way.
 */

/** The caller's Clerk id, or `null` when signed out. */
export async function callerId(ctx: QueryCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

/** The account mirrored from Clerk for `clerkId`, or `null` before sync. */
export async function userByClerkId(
  ctx: QueryCtx,
  clerkId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

/**
 * The caller's account row, or `null` when signed out or not yet synced.
 * Callers that need to tell those two apart read `callerId` first.
 */
export async function callerUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const clerkId = await callerId(ctx);
  if (clerkId === null) return null;
  return await userByClerkId(ctx, clerkId);
}
