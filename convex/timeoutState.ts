import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const CEO_CLEAR_MS = 2 * 60 * 60_000;

/** Clears, including existing records, protect for two hours from the clear. */
export function isCeoClearActive(row: Doc<"userTimeouts"> | null, now: number) {
  return (
    row?.ceoCleared === true && row.updatedAt + CEO_CLEAR_MS > now
  );
}

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
