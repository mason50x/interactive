import type { TestConvex } from "convex-test";
import { ensureGlobalMembership } from "../../convex/chat/shared";
import type schema from "../../convex/schema";

/**
 * Puts accounts past the invite gate, as redeeming a code does: a missing row
 * is created, a gated one is let in and seated in the default rooms.
 */
export async function admit(t: TestConvex<typeof schema>, ...clerkIds: string[]) {
  await t.run(async (ctx) => {
    for (const clerkId of clerkIds) {
      const user = await ctx.db
        .query("users")
        .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
        .unique();
      if (user === null) {
        await ctx.db.insert("users", { clerkId });
      } else if (user.invited === false) {
        await ctx.db.patch(user._id, { invited: true });
        if (user.username) await ensureGlobalMembership(ctx, clerkId);
      }
    }
  });
}
