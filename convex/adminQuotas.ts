import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";

import { roleFor } from "../config/roles";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { botQuotaName, botRateLimiter } from "./chat/botConfig";

const experienceLimiter = new RateLimiter(components.rateLimiter);

async function requireCeo(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || roleFor(identity.subject) !== "ceo") {
    throw new ConvexError("CEO access required.");
  }
  return identity.subject;
}

/** A compact directory for the quota console. Clerk remains the source of truth. */
export const users = query({
  args: {},
  returns: v.array(
    v.object({
      clerkId: v.string(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      username: v.optional(v.string()),
      role: v.union(v.literal("ceo"), v.literal("moderator"), v.literal("member")),
    }),
  ),
  handler: async (ctx) => {
    await requireCeo(ctx);
    const rows = await ctx.db.query("users").collect();
    return rows
      .map((user) => ({
        clerkId: user.clerkId,
        name: user.name,
        email: user.email,
        username: user.username,
        role: roleFor(user.clerkId),
      }))
      .sort((a, b) =>
        (a.name ?? a.username ?? a.email ?? a.clerkId).localeCompare(
          b.name ?? b.username ?? b.email ?? b.clerkId,
        ),
      );
  },
});

const quotaKind = v.union(v.literal("experience"), v.literal("bot"));

async function resetFor(
  ctx: MutationCtx,
  clerkId: string,
  quotas: ("experience" | "bot")[],
) {
  if (quotas.includes("bot")) {
    await botRateLimiter.reset(ctx, botQuotaName(clerkId), { key: clerkId });
  }

  if (quotas.includes("experience")) {
    const day = Math.floor(Date.now() / DAY);
    await experienceLimiter.reset(ctx, "experienceSeconds", {
      key: `${clerkId}:${day}`,
    });
    const lease = await ctx.db
      .query("experienceLeases")
      .withIndex("by_clerkId_and_day", (q) =>
        q.eq("clerkId", clerkId).eq("day", day),
      )
      .unique();
    if (lease) await ctx.db.delete(lease._id);
  }
}

/** Restores selected allowances immediately for one account or every account. */
export const reset = mutation({
  args: {
    clerkId: v.optional(v.string()),
    quotas: v.array(quotaKind),
  },
  returns: v.object({ usersReset: v.number() }),
  handler: async (ctx, { clerkId, quotas }) => {
    await requireCeo(ctx);
    const selected = [...new Set(quotas)];
    if (selected.length === 0) throw new ConvexError("Choose at least one quota.");

    if (clerkId !== undefined) {
      const user = await ctx.db
        .query("users")
        .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
        .unique();
      if (!user) throw new ConvexError("User not found.");
      await resetFor(ctx, clerkId, selected);
      return { usersReset: 1 };
    }

    const allUsers = await ctx.db.query("users").collect();
    for (const user of allUsers) await resetFor(ctx, user.clerkId, selected);
    return { usersReset: allUsers.length };
  },
});
