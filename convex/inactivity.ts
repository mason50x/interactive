import { v } from "convex/values";
import { BOT_HANDLE, BOT_ID, BOT_NAME } from "../config/bot";
import { CHAT_REWARD_SECONDS, PLAYTIME_TIMEZONE } from "../config/playtime";
import { FOUNDER_CLERK_ID } from "../config/roles";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { ensureDm } from "./chat/shared";
import { dayKey, weekKey } from "./leaderboard";
import { resolveStaffRoles } from "./roles";

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

/**
 * This week's least active member, with the numbers that made them so, or
 * `null` when no account is eligible. Reads only; the action decides what
 * to do with the answer.
 */
export const pick = internalQuery({
  args: {},
  returns: v.union(v.null(), candidateValidator),
  handler: async (ctx): Promise<Candidate | null> => {
    const now = Date.now();
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

    let least: { candidate: Candidate; lastActiveAt: number; createdAt: number } | null = null;
    let considered = 0;
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
      considered += 1;
      const seen = presence.get(user.clerkId);
      const siteSeconds = seen?.siteSeconds ?? 0;
      const playtimeSeconds = playtime.get(user.clerkId) ?? 0;
      const chatMessages = chat.get(user.clerkId) ?? 0;
      const entry = {
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
      };
      if (
        least === null ||
        entry.candidate.score < least.candidate.score ||
        (entry.candidate.score === least.candidate.score &&
          (entry.lastActiveAt < least.lastActiveAt ||
            (entry.lastActiveAt === least.lastActiveAt && entry.createdAt < least.createdAt)))
      ) {
        least = entry;
      }
    }
    if (least === null) return null;
    return { ...least.candidate, considered };
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
 * is not 2:55 Central does nothing. `force` is for running it by hand:
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

    const candidate: Candidate | null = await ctx.runQuery(internal.inactivity.pick, {});
    if (candidate === null) {
      await ctx.runMutation(internal.inactivity.notify, { body: NOBODY_BODY });
      return null;
    }

    try {
      await deleteClerkAccount(candidate.clerkId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.inactivity.notify, {
        body: failedBody(candidate, `Clerk refused the deletion (${reason}).`),
      });
      throw error;
    }

    await ctx.runMutation(internal.users.deleteFromClerk, { clerkId: candidate.clerkId });
    await ctx.runMutation(internal.inactivity.notify, { body: removedBody(candidate) });
    console.log(`Friday inactivity check removed ${candidate.clerkId} (score ${candidate.score})`);
    return candidate.clerkId;
  },
});
