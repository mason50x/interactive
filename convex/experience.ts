import { addScore } from "./leaderboard";
import { requireNotTimedOut } from "./timeoutState";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { PLAYTIME_SECONDS, CHAT_REWARD_SECONDS, playtimeDay, rewardText, similarReward } from "../config/playtime";
import type { MutationCtx } from "./_generated/server";
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

async function quotaFor(ctx: QueryCtx, clerkId: string) {
  const now = Date.now();
  // Epoch milliseconds distinguish this policy from legacy midnight day keys.
  const { day, resetsAt } = playtimeDay(now);
  const lease = await ctx.db.query("experienceLeases")
    .withIndex("by_clerkId_and_day", q => q.eq("clerkId", clerkId).eq("day", day))
    .unique();
  const user = await ctx.db.query("users")
    .withIndex("byClerkId", q => q.eq("clerkId", clerkId)).unique();
  const allowanceSeconds = (user?.activityLimitMinutes ?? PLAYTIME_SECONDS / 60) * 60 + (lease?.bonusSeconds ?? 0);
  const key = `${clerkId}:${day}`;
  const config = { kind: "fixed window" as const, rate: allowanceSeconds, period: resetsAt - day, start: day };
  const value = await limiter.getValue(ctx, "experienceSeconds", { key, config });
  return { now, day, key, config, lease, clerkId,
    status: { remainingSeconds: Math.max(0, Math.min(allowanceSeconds, value.value)),
      allowanceSeconds, leaseUntil: lease?.until ?? 0, resetsAt, serverNow: now } };
}

/** Preserve today's spent time when an admin changes the daily base limit. */
export async function changeActivityLimit(ctx: MutationCtx, clerkId: string, oldMinutes: number, newMinutes: number) {
  const { day, resetsAt } = playtimeDay(Date.now());
  const key = `${clerkId}:${day}`;
  const lease = await ctx.db.query("experienceLeases")
    .withIndex("by_clerkId_and_day", q => q.eq("clerkId", clerkId).eq("day", day)).unique();
  const bonus = lease?.bonusSeconds ?? 0;
  const oldAllowance = oldMinutes * 60 + bonus;
  const newAllowance = newMinutes * 60 + bonus;
  const oldConfig = { kind: "fixed window" as const, rate: oldAllowance, period: resetsAt - day, start: day };
  const remaining = (await limiter.getValue(ctx, "experienceSeconds", { key, config: oldConfig })).value;
  const spent = Math.max(0, oldAllowance - remaining + (lease?.activitySpentOverageSeconds ?? 0));
  await limiter.reset(ctx, "experienceSeconds", { key });
  if (spent > 0) {
    await limiter.limit(ctx, "experienceSeconds", {
      key,
      config: { ...oldConfig, rate: newAllowance },
      count: Math.min(spent, newAllowance),
    });
  }
  if (lease) await ctx.db.patch(lease._id, {
    allowanceSeconds: newAllowance,
    activitySpentOverageSeconds: Math.max(0, spent - newAllowance),
  });
}
async function quota(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to use playtime.");
  return quotaFor(ctx, identity.subject);
}

/** Called only by the accepted chat-send transaction, never by the client.
 * Qualifying messages add time immediately; distinct rewards stack.
 * Receipts survive message deletion and daily resets. The third similar
 * qualifying message in a row does not earn time. */
export async function rewardChatPlaytime(ctx: MutationCtx, clerkId: string, body: string) {
  const normalized = rewardText(body);
  if (!normalized) return;
  const recent = await ctx.db.query("playtimeRewards")
    .withIndex("by_clerkId", q => q.eq("clerkId", clerkId)).order("desc").take(2);
  if (recent.length === 2 && recent.every(row => similarReward(normalized, row.normalized))) return;
  const q = await quotaFor(ctx, clerkId);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
  await limiter.limit(ctx, "experienceSeconds", {
    key: q.key, config: q.config,
    count: -CHAT_REWARD_SECONDS,
  });
  const allowanceSeconds = q.status.allowanceSeconds + CHAT_REWARD_SECONDS;
  if (q.lease) {
    await ctx.db.patch(q.lease._id, {
      bonusSeconds: (q.lease.bonusSeconds ?? 0) + CHAT_REWARD_SECONDS,
      allowanceSeconds,
    });
  } else {
    const leaseId = await ctx.db.insert("experienceLeases", {
      clerkId, day: q.day, until: q.now,
      bonusSeconds: CHAT_REWARD_SECONDS, allowanceSeconds,
    });
    await ctx.scheduler.runAt(q.status.resetsAt, internal.experience.prune, { leaseId, key: q.key });
  }
  await ctx.db.insert("playtimeRewards", { clerkId, hash, normalized });
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
    await requireNotTimedOut(ctx, q.clerkId);
    const sessions = (q.lease?.sessions ?? []).filter(s => s.until > q.now && s.id !== sessionId);
    if (sessionId) {
      if (sessions.length >= 32) throw new ConvexError("Too many open activities");
      sessions.push({ id: sessionId, until: q.now + 15_000 });
      if (q.lease) await ctx.db.patch(q.lease._id, { sessions });
    }
    if (q.status.leaseUntil > q.now + 5_000 || q.status.remainingSeconds <= 0) return q.status;
    const from = Math.max(q.now, q.status.leaseUntil);
    const seconds = Math.min((q.now + 15_000 - from) / 1000, q.status.remainingSeconds, (q.status.resetsAt - from) / 1000);
    if (seconds <= 0) return q.status;
    const result = await limiter.limit(ctx, "experienceSeconds", { key: q.key, config: q.config, count: seconds });
    if (!result.ok) return q.status;
    await addScore(ctx, q.clerkId, "playtime", seconds, q.now);
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
    if (!q.lease?.sessions?.some(s => s.id === sessionId)) return null;
    const sessions = q.lease.sessions.filter(s => s.id !== sessionId && s.until > q.now);
    if (sessions.length) {
      await ctx.db.patch(q.lease._id, { sessions });
      return null;
    }
    const unused = Math.max(0, (q.lease.until - q.now) / 1000);
    if (unused > 0) {
      await limiter.limit(ctx, "experienceSeconds", { key: q.key, config: q.config, count: -unused });
      await addScore(ctx, q.clerkId, "playtime", -unused, q.now);
    }
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
