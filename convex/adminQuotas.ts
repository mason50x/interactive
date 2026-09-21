import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";

import { timeoutRow } from "./timeoutState";
import { roleFor } from "../config/roles";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireCeo, resolveRole, resolveStaffRoles } from "./roles";
import { botQuotaName, botRateLimiter } from "./chat/botConfig";

const experienceLimiter = new RateLimiter(components.rateLimiter);

/** Lets the client gate the page without duplicating role config in Next.js. */
export const access = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return Boolean(
      identity && (await resolveRole(ctx, identity.subject)) === "ceo",
    );
  },
});

const siteRole = v.union(
  v.literal("ceo"),
  v.literal("head_moderator"),
  v.literal("moderator"),
  v.literal("member"),
);

/** A compact directory for the quota console. Clerk remains the source of truth. */
export const users = query({
  args: {},
  returns: v.array(
    v.object({
      clerkId: v.string(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      username: v.optional(v.string()),
      role: siteRole,
    }),
  ),
  handler: async (ctx) => {
    await requireCeo(ctx);
    const overrides = new Map(
      (await ctx.db.query("staffRoles").collect()).map((row) => [
        row.clerkId,
        row.role,
      ]),
    );
    const rows = await ctx.db.query("users").collect();
    return rows
      .map((user) => ({
        clerkId: user.clerkId,
        name: user.name,
        email: user.email,
        username: user.username,
        role: overrides.get(user.clerkId) ?? roleFor(user.clerkId),
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
    await botRateLimiter.reset(ctx, await botQuotaName(ctx, clerkId), {
      key: clerkId,
    });
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

/**
 * Sets one account's site role from the Admin user directory.
 *
 * CEO-gated. The write lands in the `staffRoles` table, which every
 * authorization path reads ahead of the `STAFF_ROLES` env map — the env map
 * is deployment config with no runtime write API, so a CEO client could
 * never edit it directly.
 *
 * Two guards against locking the site out of this page: a CEO cannot change
 * their own role, and the change cannot leave zero CEOs (counting table rows
 * and env entries together).
 */
export const setRole = mutation({
  args: {
    clerkId: v.string(),
    role: siteRole,
  },
  returns: v.object({ clerkId: v.string(), role: siteRole }),
  handler: async (ctx, { clerkId, role }) => {
    const caller = await requireCeo(ctx);
    if (clerkId === caller) {
      throw new ConvexError("You cannot change your own role.");
    }
    const user = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) throw new ConvexError("User not found.");

    const staff = await resolveStaffRoles(ctx);
    const ceosAfter = staff.filter(
      (entry) =>
        (entry.clerkId === clerkId ? role : entry.role) === "ceo",
    ).length;
    // Somebody outside the staff list (a member, or an env CEO the table
    // demoted) can only count by being promoted, never by being demoted.
    const promotesToCeo =
      role === "ceo" && !staff.some((entry) => entry.clerkId === clerkId);
    if (ceosAfter + (promotesToCeo ? 1 : 0) < 1) {
      throw new ConvexError("The site needs at least one CEO.");
    }

    const existing = await ctx.db
      .query("staffRoles")
      .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        role,
        updatedAt: Date.now(),
        updatedBy: caller,
      });
    } else {
      await ctx.db.insert("staffRoles", {
        clerkId,
        role,
        updatedAt: Date.now(),
        updatedBy: caller,
      });
    }
    // A CEO role change also clears any old restriction on the account.
    const timeout = await timeoutRow(ctx, clerkId);
    if (timeout?.enabled) {
      await ctx.db.patch(timeout._id, { enabled: false, updatedAt: Date.now() });
      await ctx.db.insert("timeoutAudit", { clerkId, actor: caller, action: "off", reason: timeout.reason, expiresAt: timeout.expiresAt, at: Date.now() });
    }
    return { clerkId, role };
  },
});
