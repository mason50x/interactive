import { PLAYTIME_SECONDS, playtimeDay } from "../config/playtime";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

import { CEO_CLEAR_MS, timeoutRow } from "./timeoutState";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { requireCeo, resolveRole, resolveStaffRoles } from "./roles";
import { botQuotaName, botRateLimiter } from "./chat/botConfig";
import { changeActivityLimit } from "./experience";
import { requireNotTimedOut } from "./timeoutState";

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
  v.literal("builder"),
  v.literal("member"),
);

/** A compact directory for the quota console. Clerk remains the source of truth. */
export const users = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(
    v.object({
      clerkId: v.string(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      username: v.optional(v.string()),
      role: siteRole,
    }),
  ), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { paginationOpts }) => {
    await requireCeo(ctx);
    const result = await ctx.db.query("users").paginate(paginationOpts);
    const page = await Promise.all(result.page.map(async user => ({
        clerkId: user.clerkId,
        name: user.name,
        email: user.email,
        username: user.username,
        role: await resolveRole(ctx, user.clerkId),
      })));
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

const quotaKind = v.union(v.literal("experience"), v.literal("bot"));

/** The default follows the global policy; a custom base lasts until cleared. */
export const setActivityLimit = mutation({
  args: { clerkId: v.string(), minutes: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { clerkId, minutes }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Admin access required.");
    await requireNotTimedOut(ctx, identity.subject);
    const role = await resolveRole(ctx, identity.subject);
    if (role !== "ceo" && role !== "head_moderator") throw new ConvexError("Admin access required.");
    if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 20 || minutes > 160)) {
      throw new ConvexError("Activity time must be between 20 and 160 minutes.");
    }
    const user = await ctx.db.query("users")
      .withIndex("byClerkId", q => q.eq("clerkId", clerkId)).unique();
    if (!user) throw new ConvexError("User not found.");
    if (role === "head_moderator" && (await resolveRole(ctx, clerkId)) === "ceo") {
      throw new ConvexError("Only a CEO can change a CEO's activity time.");
    }
    const oldMinutes = user.activityLimitMinutes ?? PLAYTIME_SECONDS / 60;
    const newMinutes = minutes ?? PLAYTIME_SECONDS / 60;
    if (oldMinutes !== newMinutes) await changeActivityLimit(ctx, clerkId, oldMinutes, newMinutes);
    await ctx.db.patch(user._id, { activityLimitMinutes: minutes });
    return null;
  },
});

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
    const { day } = playtimeDay(Date.now());
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
  returns: v.object({ usersReset: v.number(), pending: v.boolean() }),
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
      return { usersReset: 1, pending: false };
    }

    const page = await ctx.db.query("users").paginate({ numItems: 20, cursor: null });
    for (const user of page.page) await resetFor(ctx, user.clerkId, selected);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.adminQuotas.continueReset, {
      quotas: selected, cursor: page.continueCursor,
    });
    return { usersReset: page.page.length, pending: !page.isDone };
  },
});

export const continueReset = internalMutation({
  args: { quotas: v.array(quotaKind), cursor: v.string() },
  returns: v.null(),
  handler: async (ctx, { quotas, cursor }) => {
    const page = await ctx.db.query("users").paginate({ numItems: 20, cursor });
    for (const user of page.page) await resetFor(ctx, user.clerkId, quotas);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.adminQuotas.continueReset, {
      quotas, cursor: page.continueCursor,
    });
    return null;
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
      const now = Date.now();
      await ctx.db.patch(timeout._id, {
        enabled: false,
        ceoCleared: true,
        updatedAt: now,
      });
      await ctx.scheduler.runAt(
        now + CEO_CLEAR_MS,
        internal.timeouts.expireCeoClear,
        { id: timeout._id, clearedAt: now },
      );
      await ctx.db.insert("timeoutAudit", {
        clerkId,
        actor: caller,
        action: "off",
        reason: timeout.reason,
        expiresAt: timeout.expiresAt,
        at: now,
      });
    }
    return { clerkId, role };
  },
});
