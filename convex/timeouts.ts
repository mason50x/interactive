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
import { badgeHidden, resolveRole } from "./roles";
import {
  activeTimeout,
  CEO_CLEAR_MS,
  isCeoClearActive,
  requireNotTimedOut,
  timeoutRow,
} from "./timeoutState";

const ranks = { member: 0, builder: 1, moderator: 1, head_moderator: 2, ceo: 3 } as const;
const timeoutView = v.object({
  rayId: v.id("userTimeouts"),
  reason: v.string(),
  expiresAt: v.number(),
  mathBypass: v.boolean(),
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

/** Heartbeats stop in hidden tabs; a snapshot is live for one minute. */
export const LIVE_WINDOW_MS = 60_000;

export const liveUsers = query({
  args: { cutoff: v.number() },
  returns: v.array(v.object({
    clerkId: v.string(),
    label: v.string(),
    username: v.optional(v.string()),
    currentPath: v.string(),
    lastActiveAt: v.number(),
  })),
  handler: async (ctx, { cutoff }) => {
    await manager(ctx);
    // The client advances cutoff every ten seconds, including when the last
    // active browser closes and no new write can wake the subscription.
    const threshold = Math.max(Date.now() - LIVE_WINDOW_MS, cutoff);
    const activity = await ctx.db.query("userActivity")
      .withIndex("byLastActiveAt", q => q.gt("lastActiveAt", threshold))
      .order("desc")
      .take(200);
    return await Promise.all(activity.map(async row => {
      const user = await ctx.db.query("users")
        .withIndex("byClerkId", q => q.eq("clerkId", row.clerkId))
        .unique();
      return {
        clerkId: row.clerkId,
        label: user?.name ?? user?.username ?? row.clerkId,
        username: user?.username,
        currentPath: row.currentPath,
        lastActiveAt: row.lastActiveAt,
      };
    }));
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
      ? {
          rayId: row._id,
          reason: row.reason,
          expiresAt: row.expiresAt,
          mathBypass: row.mathBypass !== false,
        }
      : null;
  },
});

const directoryUser = v.object({
  clerkId: v.string(),
  label: v.string(),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  username: v.optional(v.string()),
  role: v.union(
    v.literal("ceo"),
    v.literal("head_moderator"),
    v.literal("moderator"),
    v.literal("builder"),
    v.literal("member"),
  ),
  joinedAt: v.number(),
  badgeHidden: v.boolean(),
  activityLimitMinutes: v.optional(v.number()),
  canChangeRole: v.boolean(),
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
        const ceoCleared = isCeoClearActive(row, now);
        return {
          clerkId: user.clerkId,
          label: user.name ?? user.username ?? user.clerkId,
          // Contact details remain limited to the CEO directory audience.
          ...(caller.role === "ceo"
            ? { name: user.name, email: user.email }
            : {}),
          imageUrl: user.imageUrl,
          username: user.username,
          role,
          joinedAt: user.clerkCreatedAt ?? user._creationTime,
          badgeHidden: await badgeHidden(ctx, user.clerkId),
          activityLimitMinutes: user.activityLimitMinutes,
          canChangeRole: caller.role === "ceo" && user.clerkId !== caller.clerkId,
          ceoCleared,
          canManage:
            ranks[role] < ranks[caller.role] &&
            (caller.role === "ceo" ||
              (!ceoCleared && !(active && row.issuedByRole === "ceo"))),
          timeout: active
            ? {
                rayId: row._id,
                reason: row.reason,
                expiresAt: row.expiresAt,
                mathBypass: row.mathBypass !== false,
              }
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

/** The last seven days of changes for one account, visible to dashboard staff. */
export const history = query({
  args: { clerkId: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(v.object({
    id: v.id("timeoutAudit"),
    at: v.number(),
    action: v.union(v.literal("on"), v.literal("off")),
    actorClerkId: v.string(),
    actorLabel: v.string(),
    reason: v.string(),
    expiresAt: v.number(),
  })), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { clerkId, paginationOpts }) => {
    await manager(ctx);
    const cutoff = Date.now() - 7 * 24 * 60 * 60_000;
    const result = await ctx.db.query("timeoutAudit")
      .withIndex("byClerkId", q => q.eq("clerkId", clerkId).gte("_creationTime", cutoff))
      .order("desc").paginate(paginationOpts);
    const page = await Promise.all(result.page.map(async row => {
      const actor = await ctx.db.query("users")
        .withIndex("byClerkId", q => q.eq("clerkId", row.actor)).first();
      return {
        id: row._id,
        at: row.at,
        action: row.action,
        actorClerkId: row.actor,
        actorLabel: actor?.name ?? actor?.username ?? row.actor,
        reason: row.reason,
        expiresAt: row.expiresAt,
      };
    }));
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const set = mutation({
  args: {
    clerkId: v.string(),
    enabled: v.boolean(),
    reason: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    /** Let the user work the timeout off with puzzles. Defaults to on. */
    mathBypass: v.optional(v.boolean()),
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
      (isCeoClearActive(existing, now) ||
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
        if (caller.role === "ceo") {
          await ctx.scheduler.runAt(
            now + CEO_CLEAR_MS,
            internal.timeouts.expireCeoClear,
            { id: existing._id, clearedAt: now },
          );
        }
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
      mathBypass: args.mathBypass ?? true,
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
      await ctx.db.patch(id, { enabled: false, updatedAt: Date.now() });
    }
    return null;
  },
});

/** Wake directory subscriptions at expiry without undoing a newer clear. */
export const expireCeoClear = internalMutation({
  args: { id: v.id("userTimeouts"), clearedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, clearedAt }) => {
    const row = await ctx.db.get(id);
    if (
      row?.ceoCleared &&
      row.updatedAt === clearedAt &&
      clearedAt + CEO_CLEAR_MS <= Date.now()
    ) {
      await ctx.db.patch(id, { ceoCleared: false });
    }
    return null;
  },
});

/** Catch up legacy or delayed clears; authorization also checks server time. */
export const expireCeoClears = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("userTimeouts")
      .withIndex("byCeoClearedAndUpdatedAt", (q) =>
        q.eq("ceoCleared", true).lte("updatedAt", Date.now() - CEO_CLEAR_MS),
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
