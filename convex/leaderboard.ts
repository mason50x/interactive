import { v } from "convex/values";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";

const DAY = 86_400_000;
const PAGE_PATHS = ["/activities", "/entertainment", "/chat", "/experience", "/learning-simulator", "/leaderboard"] as const;
export const dayKey = (now: number) => Math.floor(now / DAY);
const weekKey = (now: number) => Math.floor((dayKey(now) + 3) / 7); // Monday UTC
const monthKey = (now: number) => new Date(now).getUTCFullYear() * 12 + new Date(now).getUTCMonth();
const scoreKeys = (metric: "playtime" | "chat", now: number) => metric === "playtime"
  ? [`playtime:all`, `playtime:day:${dayKey(now)}`]
  : [`chat:day:${dayKey(now)}`, `chat:week:${weekKey(now)}`, `chat:month:${monthKey(now)}`];
const expiryFor = (key: string, now: number) => key.includes(":all") ? undefined
  : key.includes(":day:") ? (dayKey(now) + 35) * DAY
  : key.includes(":week:") ? (dayKey(now) + 84) * DAY
  : (dayKey(now) + 400) * DAY;

/** Per-account counters only. There is no shared hot row and no raw event log. */
export async function addScore(ctx: MutationCtx, clerkId: string, metric: "playtime" | "chat", amount: number, now = Date.now()) {
  for (const key of scoreKeys(metric, now)) {
    const row = await ctx.db.query("leaderboardScores")
      .withIndex("by_key_and_clerk", q => q.eq("key", key).eq("clerkId", clerkId)).unique();
    if (row) await ctx.db.patch(row._id, { score: Math.max(0, row.score + amount) });
    else if (amount > 0) await ctx.db.insert("leaderboardScores", { key, clerkId, score: amount, expiresAt: expiryFor(key, now) });
  }
}

export function pageKey(path: string): string | null {
  const segment = `/${path.split("/")[1] ?? ""}`;
  return PAGE_PATHS.includes(segment as typeof PAGE_PATHS[number]) ? segment : null;
}

/** Called from the existing visible-tab heartbeat only on a page transition or after a minute away. */
export async function recordPage(ctx: MutationCtx, path: string, now = Date.now()) {
  const page = pageKey(path);
  if (!page) return;
  const day = dayKey(now);
  const row = await ctx.db.query("leaderboardPages")
    .withIndex("by_day_and_path", q => q.eq("day", day).eq("path", page)).unique();
  if (row) await ctx.db.patch(row._id, { views: row.views + 1 });
  else await ctx.db.insert("leaderboardPages", { day, path: page, views: 1 });
}

const period = v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("all"));
export const standings = query({
  args: { metric: v.union(v.literal("playtime"), v.literal("chat"), v.literal("pages")), period, clock: v.number() },
  handler: async (ctx, { metric, period, clock }) => {
    if (!await ctx.auth.getUserIdentity()) return { people: [], pages: [] };
    const now = Date.now();
    if (Math.abs(clock - dayKey(now)) > 1) return { people: [], pages: [] };
    if (metric === "pages") {
      const rows = await ctx.db.query("leaderboardPages")
        .withIndex("by_day_and_views", q => q.eq("day", dayKey(now))).order("desc").take(PAGE_PATHS.length);
      return { people: [], pages: rows.map(({ path, views }) => ({ path, views })) };
    }
    const bucket = period === "all" ? "all" : period === "day" ? `day:${dayKey(now)}`
      : period === "week" ? `week:${weekKey(now)}` : `month:${monthKey(now)}`;
    const key = `${metric}:${bucket}`;
    const rows = await ctx.db.query("leaderboardScores")
      .withIndex("by_key_and_score", q => q.eq("key", key)).order("desc").take(50);
    const people = await Promise.all(rows.map(async row => {
      const user = await ctx.db.query("users").withIndex("byClerkId", q => q.eq("clerkId", row.clerkId)).first();
      return user ? { clerkId: row.clerkId, name: user.firstName || user.username || user.name?.split(/\s+/)[0] || "Member", handle: user.username ?? null, imageUrl: user.imageUrl ?? null, score: row.score } : null;
    }));
    return { people: people.filter((person): person is NonNullable<typeof person> => person !== null).slice(0, 25), pages: [] };
  },
});

/** Fixed-size batches keep cron transactions small even after a long outage. */
export const prune = internalMutation({
  args: {},
  handler: async ctx => {
    const cutoff = Date.now();
    const scores = await ctx.db.query("leaderboardScores")
      .withIndex("by_expiry", q => q.gte("expiresAt", 0).lt("expiresAt", cutoff)).take(100);
    for (const row of scores) await ctx.db.delete(row._id);
    const pages = await ctx.db.query("leaderboardPages")
      .withIndex("by_day", q => q.lt("day", dayKey(cutoff) - 35)).take(100);
    for (const row of pages) await ctx.db.delete(row._id);
    if (scores.length === 100 || pages.length === 100) {
      await ctx.scheduler.runAfter(0, internal.leaderboard.prune, {});
    }
  },
});

export const purgeAccount = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const rows = await ctx.db.query("leaderboardScores")
      .withIndex("by_clerk", q => q.eq("clerkId", clerkId)).take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100) await ctx.scheduler.runAfter(0, internal.leaderboard.purgeAccount, { clerkId });
  },
});
