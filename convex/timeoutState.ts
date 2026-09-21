import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const DAY_MS = 86_400_000;

export function timeoutDayStart(now: number) {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

/** Clears, including existing records, protect only the UTC day they were made. */
export function ceoClearedToday(row: Doc<"userTimeouts"> | null, now: number) {
  return (
    row?.ceoCleared === true &&
    timeoutDayStart(row.updatedAt) === timeoutDayStart(now)
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
