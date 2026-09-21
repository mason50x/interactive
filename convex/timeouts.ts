import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { resolveRole } from "./roles";
import {
  activeTimeout,
  ceoClearedToday,
  requireNotTimedOut,
  timeoutDayStart,
  timeoutRow,
} from "./timeoutState";

const ranks = { member: 0, moderator: 1, head_moderator: 2, ceo: 3 } as const;
const timeoutView = v.object({
  rayId: v.id("userTimeouts"),
  reason: v.string(),
  expiresAt: v.number(),
});

async function manager(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Timeout management access required.");
  await requireNotTimedOut(ctx, identity.subject);
  const role = await resolveRole(ctx, identity.subject);
  if (role !== "ceo" && role !== "head_moderator")
    throw new ConvexError("Timeout management access required.");
  return { clerkId: identity.subject, role };
}

export const access = query({
  args: {},
  returns: v.union(v.literal("ceo"), v.literal("head_moderator"), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || (await activeTimeout(ctx, identity.subject))) return null;
    const role = await resolveRole(ctx, identity.subject);
    return role === "ceo" || role === "head_moderator" ? role : null;
  },
});

export const mine = query({
  args: {},
  returns: v.union(timeoutView, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in required.");
    const row = await activeTimeout(ctx, identity.subject);
    return row
      ? { rayId: row._id, reason: row.reason, expiresAt: row.expiresAt }
      : null;
  },
});

const directoryUser = v.object({
  clerkId: v.string(),
  label: v.string(),
  username: v.optional(v.string()),
  canManage: v.boolean(),
  ceoCleared: v.boolean(),
  timeout: v.union(timeoutView, v.null()),
});
export const users = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(directoryUser),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const caller = await manager(ctx);
    const result = await ctx.db.query("users").paginate(args.paginationOpts);
    const now = Date.now();
    const page = await Promise.all(
      result.page.map(async (user) => {
        const role = await resolveRole(ctx, user.clerkId);
        const row = await timeoutRow(ctx, user.clerkId);
        const active = row?.enabled && row.expiresAt > now;
        const ceoCleared = ceoClearedToday(row, now);
        return {
          clerkId: user.clerkId,
          label: user.name ?? user.username ?? user.clerkId,
          username: user.username,
          ceoCleared,
          canManage:
            ranks[role] < ranks[caller.role] &&
            (caller.role === "ceo" ||
              (!ceoCleared && !(active && row.issuedByRole === "ceo"))),
          timeout: active
            ? { rayId: row._id, reason: row.reason, expiresAt: row.expiresAt }
            : null,
        };
      }),
    );
    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const set = mutation({
  args: {
    clerkId: v.string(),
    enabled: v.boolean(),
    reason: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const caller = await manager(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (!user) throw new ConvexError("User not found.");
    const role = await resolveRole(ctx, args.clerkId);
    if (ranks[role] >= ranks[caller.role])
      throw new ConvexError("You can only timeout users below your role.");
    const existing = await timeoutRow(ctx, args.clerkId);
    const now = Date.now();
    if (
      caller.role !== "ceo" &&
      (ceoClearedToday(existing, now) ||
        (existing?.enabled &&
          existing.expiresAt > now &&
          existing.issuedByRole === "ceo"))
    ) {
      throw new ConvexError("Only a CEO can change this timeout.");
    }
    if (!args.enabled) {
      if (existing && (existing.enabled || caller.role === "ceo")) {
        await ctx.db.patch(existing._id, {
          enabled: false,
          ceoCleared: caller.role === "ceo",
          updatedAt: now,
        });
        await ctx.db.insert("timeoutAudit", {
          clerkId: args.clerkId,
          actor: caller.clerkId,
          action: "off",
          reason: existing.reason,
          expiresAt: existing.expiresAt,
          at: now,
        });
      }
      return null;
    }
    const reason = args.reason?.trim();
    const minutes = args.durationMinutes;
    if (!reason || reason.length > 1000)
      throw new ConvexError("Enter a reason between 1 and 1,000 characters.");
    if (
      minutes === undefined ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 43200
    )
      throw new ConvexError("Choose a duration from 1 minute to 30 days.");
    const expiresAt = now + minutes * 60_000;
    const data = {
      clerkId: args.clerkId,
      reason,
      expiresAt,
      enabled: true,
      ceoCleared: false,
      issuedBy: caller.clerkId,
      issuedByRole: caller.role,
      updatedAt: now,
    };
    const id = existing?._id ?? (await ctx.db.insert("userTimeouts", data));
    if (existing) await ctx.db.patch(id, data);
    await ctx.db.insert("timeoutAudit", {
      clerkId: args.clerkId,
      actor: caller.clerkId,
      action: "on",
      reason,
      expiresAt,
      at: now,
    });
    // Wake subscriptions at expiry. Authorization also checks server time, even if this job is delayed.
    await ctx.scheduler.runAt(expiresAt, internal.timeouts.expire, {
      id,
      expiresAt,
    });
    return null;
  },
});

export const expire = internalMutation({
  args: { id: v.id("userTimeouts"), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, expiresAt }) => {
    const row = await ctx.db.get(id);
    if (
      row?.enabled &&
      row.expiresAt === expiresAt &&
      expiresAt <= Date.now()
    ) {
      await ctx.db.patch(id, { enabled: false });
    }
    return null;
  },
});

/** Wake directory subscriptions at midnight; authorization also checks server time. */
export const expireCeoClears = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("userTimeouts")
      .withIndex("byCeoClearedAndUpdatedAt", (q) =>
        q.eq("ceoCleared", true).lt("updatedAt", timeoutDayStart(Date.now())),
      )
      .take(100);
    for (const row of rows) {
      await ctx.db.patch(row._id, { ceoCleared: false });
    }
    if (rows.length === 100) {
      await ctx.scheduler.runAfter(0, internal.timeouts.expireCeoClears, {});
    }
    return null;
  },
});
