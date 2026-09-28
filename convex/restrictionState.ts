import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * What every public function throws for a restricted caller. A plain string so
 * existing `error.data` readers show something sensible, and a fixed one so
 * `RestrictionGate` can recognise it and swallow the error rather than crash.
 */
export const RESTRICTED_ERROR = "This account is restricted.";

export async function restrictionRow(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
) {
  return ctx.db
    .query("accountRestrictions")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}
