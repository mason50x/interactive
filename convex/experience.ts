import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { isChatAdmin } from "../config/chat-admin";
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
  const allowanceSeconds = isChatAdmin(identity.subject) ? 5 * 60 * 60 : 5 * 60;
  const key = `${identity.subject}:${day}`;
  const config = { kind: "fixed window" as const, rate: allowanceSeconds, period: DAY, start: day * DAY };
  const value = await limiter.getValue(ctx, "experienceSeconds", { key, config });
  const lease = await ctx.db.query("experienceLeases")
    .withIndex("by_clerkId_and_day", q => q.eq("clerkId", identity.subject).eq("day", day))
    .unique();
  return { now, day, key, config, lease, clerkId: identity.subject,
    status: { remainingSeconds: Math.max(0, Math.min(allowanceSeconds, value.value)),
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
 * Closing or hiding a tab spends at most the already reserved interval. */
export const acquire = mutation({
  args: {},
  returns: statusValidator,
  handler: async ctx => {
    const q = await quota(ctx);
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
      const leaseId = await ctx.db.insert("experienceLeases", { clerkId: q.clerkId, day: q.day, until });
      // One cleanup per account/day. Day-specific keys keep a delayed cleanup
      // from resetting today's allowance. reset deletes the component row too.
      await ctx.scheduler.runAt(q.status.resetsAt, internal.experience.prune, { leaseId, key: q.key });
    }
    return { ...q.status, remainingSeconds: q.status.remainingSeconds - seconds, leaseUntil: until };
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
