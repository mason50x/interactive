import { v } from "convex/values";
import { BOT_HANDLE, BOT_ID, BOT_NAME } from "../config/bot";
import { CHAT_REWARD_SECONDS, PLAYTIME_TIMEZONE } from "../config/playtime";
import { FOUNDER_CLERK_ID } from "../config/roles";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { ensureDm } from "./chat/shared";
import { mutation, query } from "./functions";
import { dayKey, weekKey } from "./leaderboard";
import { requireCeo, resolveStaffRoles } from "./roles";

/**
 * The Friday cull.
 *
 * Every Friday at 2:55 in the afternoon, Central Time, the member account
 * that has done the least on the site since Monday is deleted from Clerk,
 * the same cascade the deletion webhook runs is run straight away, and the
 * bot tells Mason who went. Staff are never candidates, and neither is an
 * account still at the invite gate or one made since Monday — the first
 * two have not been given the week, and the last would lose every time.
 *
 * ## What "least active" adds up
 *
 * Everything the site already measures in time, in seconds, plus chat at
 * the site's own exchange rate:
 *
 * - time with the site open on a weekday, which the heartbeat accumulates
 *   on the account's `userActivity` row (see `weekSeconds` in `schema.ts`);
 * - playtime spent — games, emulators, TV and Browse apps all buy their
 *   seconds through `experience.acquire`, which scores them in
 *   `leaderboardScores` under `playtime:day:*`;
 * - chat messages sent, from the same table under `chat:day:*`, each worth
 *   `CHAT_REWARD_SECONDS`, which is what a message earns in playtime.
 *
 * Playing is also time on the site, so it counts twice: an hour of games
 * outranks an hour on the home page, which is the intended order. The days
 * are the leaderboard's UTC days, Monday through Friday of the current
 * week, read as whole buckets so the cost is ten range reads however many
 * accounts there are. Ties go to whoever was seen least recently, then to
 * the older account, so the choice is the same however the rows are read.
 */

const DAY = 86_400_000;

/** The hour of the day, Central Time, the job is meant for. */
export const CULL_HOUR = 14;

/**
 * Whether `now` is the Friday afternoon hour the cull is booked for.
 *
 * Convex crons keep UTC time only, and Central Time is five hours behind
 * it in summer and six in winter, so `crons.ts` books the job at both
 * 19:55 and 20:55 UTC and this decides which of the two is 2:55 local. The
 * weekday is checked too, so that a manual run on the wrong day does
 * nothing unless it says `force`.
 */
export function isCullTime(now: number): boolean {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PLAYTIME_TIMEZONE,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return parts.weekday === "Fri" && Number(parts.hour) === CULL_HOUR;
}

/**
 * When the next booking that `isCullTime` accepts falls, strictly after
 * `now`: the two UTC bookings `crons.ts` makes, tried day by day.
 */
export function nextCullAt(now: number): number {
  const midnight = Math.floor(now / DAY) * DAY;
  for (let day = 0; day <= 8; day++) {
    for (const hour of [19, 20]) {
      const at = midnight + day * DAY + hour * 3_600_000 + 55 * 60_000;
      if (at > now && isCullTime(at)) return at;
    }
  }
  throw new Error("No Friday booking in the next eight days");
}

/** Monday through Friday of the week `now` is in, as leaderboard day keys. */
export function weekDays(now: number): number[] {
  const monday = weekKey(now) * 7 - 3;
  return [0, 1, 2, 3, 4].map((offset) => monday + offset);
}

const candidateValidator = v.object({
  clerkId: v.string(),
  /** The chat handle, when the account has one. */
  handle: v.union(v.string(), v.null()),
  /** What to call them: first name, else handle, else nothing. */
  name: v.union(v.string(), v.null()),
  siteSeconds: v.number(),
  playtimeSeconds: v.number(),
  chatMessages: v.number(),
  /** The three above, added as described at the top of the file. */
  score: v.number(),
  /** How many member accounts were in the running. */
  considered: v.number(),
  /** Monday 00:00 UTC of the week that was scored. */
  windowStart: v.number(),
});

export type Candidate = {
  clerkId: string;
  handle: string | null;
  name: string | null;
  siteSeconds: number;
  playtimeSeconds: number;
  chatMessages: number;
  score: number;
  considered: number;
  windowStart: number;
};

/** The sum of one score bucket per account, for every day of the window. */
async function bucketTotals(
  ctx: QueryCtx,
  metric: "playtime" | "chat",
  days: number[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  for (const day of days) {
    const rows = await ctx.db
      .query("leaderboardScores")
      .withIndex("by_key_and_score", (q) => q.eq("key", `${metric}:day:${day}`))
      .take(10_000);
    for (const row of rows) {
      totals.set(row.clerkId, (totals.get(row.clerkId) ?? 0) + row.score);
    }
  }
  return totals;
}

type Ranked = { candidate: Candidate; lastActiveAt: number };

/**
 * Every eligible member account for the week `now` is in, least active
 * first, ties broken as described at the top of the file. Shared by the job
 * and the admin console's preview, so the console shows exactly who the job
 * would take.
 */
async function rank(ctx: QueryCtx, now: number): Promise<{ ranked: Ranked[]; windowStart: number }> {
  const days = weekDays(now).filter((day) => day <= dayKey(now));
  const windowStart = days[0] * DAY;
  const week = weekKey(now);

  const staff = new Set((await resolveStaffRoles(ctx)).map((entry) => entry.clerkId));
  const playtime = await bucketTotals(ctx, "playtime", days);
  const chat = await bucketTotals(ctx, "chat", days);

  const presence = new Map<string, { siteSeconds: number; lastActiveAt: number }>();
  for await (const row of ctx.db.query("userActivity")) {
    presence.set(row.clerkId, {
      siteSeconds: row.weekKey === week ? (row.weekSeconds ?? 0) : 0,
      lastActiveAt: row.lastActiveAt,
    });
  }

  const entries: (Ranked & { createdAt: number })[] = [];
  for await (const user of ctx.db.query("users")) {
    const createdAt = user.clerkCreatedAt ?? user._creationTime;
    if (
      user.clerkId === BOT_ID ||
      user.clerkId === FOUNDER_CLERK_ID ||
      staff.has(user.clerkId) ||
      user.invited === false ||
      createdAt >= windowStart
    ) {
      continue;
    }
    const seen = presence.get(user.clerkId);
    const siteSeconds = seen?.siteSeconds ?? 0;
    const playtimeSeconds = playtime.get(user.clerkId) ?? 0;
    const chatMessages = chat.get(user.clerkId) ?? 0;
    entries.push({
      candidate: {
        clerkId: user.clerkId,
        handle: user.username ?? null,
        name: user.firstName || user.name?.split(/\s+/)[0] || user.username || null,
        siteSeconds,
        playtimeSeconds,
        chatMessages,
        score: siteSeconds + playtimeSeconds + chatMessages * CHAT_REWARD_SECONDS,
        considered: 0,
        windowStart,
      },
      lastActiveAt: seen?.lastActiveAt ?? 0,
      createdAt,
    });
  }
  entries.sort(
    (a, b) =>
      a.candidate.score - b.candidate.score ||
      a.lastActiveAt - b.lastActiveAt ||
      a.createdAt - b.createdAt,
  );
  const considered = entries.length;
  return {
    ranked: entries.map(({ candidate, lastActiveAt }) => ({
      candidate: { ...candidate, considered },
      lastActiveAt,
    })),
    windowStart,
  };
}

/**
 * This week's least active member, with the numbers that made them so, or
 * `null` when no account is eligible. Reads only; the action decides what
 * to do with the answer.
 */
export const pick = internalQuery({
  args: {},
  returns: v.union(v.null(), candidateValidator),
  handler: async (ctx): Promise<Candidate | null> => {
    const { ranked } = await rank(ctx, Date.now());
    return ranked[0]?.candidate ?? null;
  },
});

async function settingsRow(ctx: QueryCtx | MutationCtx) {
  return ctx.db.query("inactivitySettings").first();
}

/** Whether the Friday job is on. No row yet reads as on. */
export const isEnabled = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => (await settingsRow(ctx))?.enabled ?? true,
});

/** Keeps what the last Friday came to, for the admin console. */
export const record = internalMutation({
  args: {
    outcome: v.union(v.literal("removed"), v.literal("nobody"), v.literal("failed"), v.literal("skipped")),
    name: v.optional(v.string()),
    handle: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { outcome, name, handle }) => {
    const lastRun = { at: Date.now(), outcome, name, handle };
    const row = await settingsRow(ctx);
    if (row) await ctx.db.patch(row._id, { lastRun });
    else await ctx.db.insert("inactivitySettings", { enabled: true, lastRun });
    return null;
  },
});

/** How many of the bottom of the week the console lists. */
const STANDINGS = 10;

const standingValidator = v.object({
  clerkId: v.string(),
  handle: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
  imageUrl: v.union(v.string(), v.null()),
  siteSeconds: v.number(),
  playtimeSeconds: v.number(),
  chatMessages: v.number(),
  score: v.number(),
  lastActiveAt: v.union(v.number(), v.null()),
});

/**
 * The CEO's view of the Friday job: whether it is on, when it next fires,
 * who it would take if it fired now, and how last time went. `now` comes
 * from the client so the query stays cacheable, as `invites.list` does.
 */
export const status = query({
  args: { now: v.number() },
  returns: v.object({
    enabled: v.boolean(),
    updatedAt: v.union(v.number(), v.null()),
    updatedBy: v.union(v.string(), v.null()),
    nextRunAt: v.number(),
    windowStart: v.number(),
    considered: v.number(),
    standings: v.array(standingValidator),
    lastRun: v.union(
      v.null(),
      v.object({
        at: v.number(),
        outcome: v.union(v.literal("removed"), v.literal("nobody"), v.literal("failed"), v.literal("skipped")),
        name: v.union(v.string(), v.null()),
        handle: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, { now }) => {
    await requireCeo(ctx);
    const row = await settingsRow(ctx);
    const { ranked, windowStart } = await rank(ctx, now);
    const standings = [];
    for (const { candidate, lastActiveAt } of ranked.slice(0, STANDINGS)) {
      const user = await ctx.db
        .query("users")
        .withIndex("byClerkId", (q) => q.eq("clerkId", candidate.clerkId))
        .unique();
      standings.push({
        clerkId: candidate.clerkId,
        handle: candidate.handle,
        name: candidate.name,
        imageUrl: user?.imageUrl ?? null,
        siteSeconds: candidate.siteSeconds,
        playtimeSeconds: candidate.playtimeSeconds,
        chatMessages: candidate.chatMessages,
        score: candidate.score,
        lastActiveAt: lastActiveAt || null,
      });
    }
    let updatedBy: string | null = null;
    if (row?.updatedBy) {
      const user = await ctx.db
        .query("users")
        .withIndex("byClerkId", (q) => q.eq("clerkId", row.updatedBy!))
        .unique();
      updatedBy = user?.username ? `@${user.username}` : (user?.name ?? row.updatedBy);
    }
    return {
      enabled: row?.enabled ?? true,
      updatedAt: row?.updatedAt ?? null,
      updatedBy,
      nextRunAt: nextCullAt(now),
      windowStart,
      considered: ranked.length,
      standings,
      lastRun: row?.lastRun
        ? {
            at: row.lastRun.at,
            outcome: row.lastRun.outcome,
            name: row.lastRun.name ?? null,
            handle: row.lastRun.handle ?? null,
          }
        : null,
    };
  },
});

/** A CEO turns the Friday job on or off. Off, the bookings do nothing. */
export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { enabled }) => {
    const clerkId = await requireCeo(ctx);
    const patch = { enabled, updatedAt: Date.now(), updatedBy: clerkId };
    const row = await settingsRow(ctx);
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("inactivitySettings", patch);
    return null;
  },
});

/** "12 minutes", "1 minute", "under a minute", or "no time". Whole minutes, rounded down. */
export function describeSeconds(seconds: number): string {
  if (seconds <= 0) return "no time";
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return "under a minute";
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function who(candidate: Candidate): string {
  const name = candidate.name ?? "an account with no name";
  return candidate.handle ? `${name} (@${candidate.handle})` : name;
}

export function removedBody(candidate: Candidate): string {
  return (
    `Friday inactivity check: I removed ${who(candidate)}, this week's least active account. ` +
    `Monday to Friday they had ${describeSeconds(candidate.siteSeconds)} on the site, ` +
    `${describeSeconds(candidate.playtimeSeconds)} of playtime, and ` +
    `${candidate.chatMessages} chat message${candidate.chatMessages === 1 ? "" : "s"}. ` +
    `${candidate.considered} member account${candidate.considered === 1 ? " was" : "s were"} considered; staff were skipped.`
  );
}

export function failedBody(candidate: Candidate, reason: string): string {
  return (
    `Friday inactivity check: I could not remove ${who(candidate)}, this week's least active account. ` +
    `${reason} Nothing was changed; the check runs again next Friday.`
  );
}

export const NOBODY_BODY =
  "Friday inactivity check: nobody was removed. No member account was eligible this week; " +
  "staff, accounts still at the invite gate, and accounts made since Monday are skipped.";

/**
 * Delete the account from Clerk. Clerk then sends the `user.deleted`
 * webhook, which runs the same cascade `run` starts itself; the replay is
 * harmless, see `deleteFromClerk` in `users.ts`. An account that is already
 * gone is the outcome wanted, not a failure.
 */
async function deleteClerkAccount(clerkId: string): Promise<void> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("CLERK_SECRET_KEY is not configured");
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`Clerk account deletion failed (${response.status})`);
}

/** The bot's word to Mason, in their private bot direct message. */
export const notify = internalMutation({
  args: { body: v.string() },
  returns: v.id("messages"),
  handler: async (ctx, { body }) => {
    const conversationId = await ensureDm(ctx, FOUNDER_CLERK_ID, BOT_ID);
    const messageId = await ctx.db.insert("messages", {
      conversationId,
      authorClerkId: BOT_ID,
      authorHandle: BOT_HANDLE,
      authorName: BOT_NAME,
      body,
      status: "visible",
      flags: [],
    });
    await ctx.db.patch(conversationId, { lastMessageAt: Date.now() });
    return messageId;
  },
});

/**
 * The job itself. Booked twice on Fridays by `crons.ts`; the booking that
 * is not 2:55 Central does nothing, and while a CEO has the job switched off
 * in the admin console the one that is does nothing either. `force` is for
 * running it by hand, and runs it whether or not it is switched on:
 *
 *   npx convex run inactivity:run '{"force": true}'
 *
 * Returns the Clerk id of the account removed, or `null`.
 */
export const run = internalAction({
  args: { force: v.optional(v.boolean()) },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { force }): Promise<string | null> => {
    if (!force && !isCullTime(Date.now())) return null;
    if (!force && !(await ctx.runQuery(internal.inactivity.isEnabled, {}))) {
      await ctx.runMutation(internal.inactivity.record, { outcome: "skipped" });
      return null;
    }

    const candidate: Candidate | null = await ctx.runQuery(internal.inactivity.pick, {});
    if (candidate === null) {
      await ctx.runMutation(internal.inactivity.notify, { body: NOBODY_BODY });
      await ctx.runMutation(internal.inactivity.record, { outcome: "nobody" });
      return null;
    }
    const who = { name: candidate.name ?? undefined, handle: candidate.handle ?? undefined };

    try {
      await deleteClerkAccount(candidate.clerkId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.inactivity.notify, {
        body: failedBody(candidate, `Clerk refused the deletion (${reason}).`),
      });
      await ctx.runMutation(internal.inactivity.record, { ...who, outcome: "failed" });
      throw error;
    }

    await ctx.runMutation(internal.users.deleteFromClerk, { clerkId: candidate.clerkId });
    await ctx.runMutation(internal.inactivity.notify, { body: removedBody(candidate) });
    await ctx.runMutation(internal.inactivity.record, { ...who, outcome: "removed" });
    console.log(`Friday inactivity check removed ${candidate.clerkId} (score ${candidate.score})`);
    return candidate.clerkId;
  },
});
