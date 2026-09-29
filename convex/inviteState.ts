import type { MutationCtx, QueryCtx } from "./_generated/server";
import { resolveRole } from "./roles";

/**
 * What every public function throws for an account still at the invite gate.
 * Fixed, like `ANNOUNCEMENT_ERROR`, so the client can recognise it.
 */
export const UNINVITED_ERROR = "Enter an invite code first.";

/**
 * Whether this account is still outside: no row yet, or a row that has not
 * redeemed a code. Absent `invited` is a row from before invites, which is in.
 * Staff are never outside, as their rows are never created gated, so a
 * missing row can't lock the site's owners out.
 */
export async function isUninvited(ctx: QueryCtx | MutationCtx, clerkId: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
  if (user === null) return (await resolveRole(ctx, clerkId)) === "member";
  return user.invited === false;
}
