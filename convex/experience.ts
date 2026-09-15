import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { privilegesFor, roleFor } from "../config/roles";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";

const limiter = new RateLimiter(components.rateLimiter);
const statusValidator = v.object({
  remainingSeconds: v.number(),
  allowanceSeconds: v.number(),
  leaseUntil: v.number(),
  resetsAt: v.number(),
  serverNow: v.number(),
});

async function quota(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to use Experience.");
  const now = Date.now();
  const day = Math.floor(now / DAY);
  const allowanceSeconds = privilegesFor(identity.subject).experienceSecondsPerDay;
  const key = `${identity.subject}:${day}`;
  const config = { kind: "fixed window" as const, rate: allowanceSeconds, period: DAY, start: day * DAY };
  const value = await limiter.getValue(ctx, "experienceSeconds", { key, config });
  const lease = await ctx.db.query("experienceLeases")
    .withIndex("by_clerkId_and_day", q => q.eq("clerkId", identity.subject).eq("day", day))
    .unique();
  const previousAllowance = lease?.allowanceSeconds ?? (roleFor(identity.subject) !== "member" ? 18_000 : 300);
  const adjustment = lease ? allowanceSeconds - previousAllowance : 0;
  return { now, day, key, config, lease, adjustment, clerkId: identity.subject,
    status: { remainingSeconds: Math.max(0, Math.min(allowanceSeconds, value.value + adjustment)),
      allowanceSeconds, leaseUntil: lease?.until ?? 0, resetsAt: (day + 1) * DAY, serverNow: now } };
}

// The day is a subscription refresh key only. Accounting always uses server time.
export const status = query({
  args: { day: v.number() },
  returns: statusValidator,
  handler: async ctx => (await quota(ctx)).status,
});

/** Reserve up to 15 seconds before mounting the frame. A shared lease makes
 * retries, reloads, and multiple tabs idempotent, with no per-heartbeat log.
 * Each browser session releases its unused reservation when it leaves. */
export const acquire = mutation({
  args: { sessionId: v.optional(v.string()) },
  returns: statusValidator,
  handler: async (ctx, { sessionId }) => {
    if (sessionId !== undefined && (!sessionId || sessionId.length > 100)) throw new ConvexError("Invalid session");
    const q = await quota(ctx);
    if (q.lease && q.adjustment !== 0) {
      await limiter.limit(ctx, "experienceSeconds", { key: q.key, config: { ...q.config, rate: q.status.allowanceSeconds - q.adjustment }, count: -q.adjustment, reserve: true });
      await ctx.db.patch(q.lease._id, { allowanceSeconds: q.status.allowanceSeconds });
    }
    const sessions = (q.lease?.sessions ?? []).filter(s => s.until > q.now && s.id !== sessionId);
    if (sessionId) {
      if (sessions.length >= 32) throw new ConvexError("Too many open Experience apps");
      sessions.push({ id: sessionId, until: q.now + 15_000 });
      if (q.lease) await ctx.db.patch(q.lease._id, { sessions });
    }
    if (q.status.leaseUntil > q.now + 5_000 || q.status.remainingSeconds <= 0) return q.status;
    const from = Math.max(q.now, q.status.leaseUntil);
    const seconds = Math.min((q.now + 15_000 - from) / 1000, q.status.remainingSeconds, (q.status.resetsAt - from) / 1000);
    if (seconds <= 0) return q.status;
    const result = await limiter.limit(ctx, "experienceSeconds", { key: q.key, config: q.config, count: seconds });
    if (!result.ok) return q.status;
    const until = from + seconds * 1000;
    if (q.lease) {
      await ctx.db.patch(q.lease._id, { until });
    } else {
      const leaseId = await ctx.db.insert("experienceLeases", { clerkId: q.clerkId, day: q.day, until, allowanceSeconds: q.status.allowanceSeconds, ...(sessionId ? { sessions } : {}) });
      // One cleanup per account/day. Day-specific keys keep a delayed cleanup
      // from resetting today's allowance. reset deletes the component row too.
      await ctx.scheduler.runAt(q.status.resetsAt, internal.experience.prune, { leaseId, key: q.key });
    }
    return { ...q.status, remainingSeconds: q.status.remainingSeconds - seconds, leaseUntil: until };
  },
});

/** Return unused time only after the last live browser session leaves.
 * Session ownership makes delayed closes and repeated unload requests harmless. */
export const release = mutation({
  args: { sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const q = await quota(ctx);
    if (q.lease && q.adjustment !== 0) {
      await limiter.limit(ctx, "experienceSeconds", { key: q.key, config: { ...q.config, rate: q.status.allowanceSeconds - q.adjustment }, count: -q.adjustment, reserve: true });
      await ctx.db.patch(q.lease._id, { allowanceSeconds: q.status.allowanceSeconds });
    }
    if (!q.lease?.sessions?.some(s => s.id === sessionId)) return null;
    const sessions = q.lease.sessions.filter(s => s.id !== sessionId && s.until > q.now);
    if (sessions.length) {
      await ctx.db.patch(q.lease._id, { sessions });
      return null;
    }
    const unused = Math.max(0, (q.lease.until - q.now) / 1000);
    if (unused > 0) await limiter.limit(ctx, "experienceSeconds", { key: q.key, config: q.config, count: -unused });
    await ctx.db.patch(q.lease._id, { sessions: [], until: q.now });
    return null;
  },
});

export const prune = internalMutation({
  args: { leaseId: v.id("experienceLeases"), key: v.string() },
  returns: v.null(),
  handler: async (ctx, { leaseId, key }) => {
    await limiter.reset(ctx, "experienceSeconds", { key });
    if (await ctx.db.get(leaseId)) await ctx.db.delete(leaseId);
    return null;
  },
});
