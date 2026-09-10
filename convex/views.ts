import { v } from "convex/values";
import {
  clampOffset,
  dayKey,
  foldActivityDay,
  foldUserDay,
  userDaysBetween,
  utcDayKey,
  weekWindow,
} from "./days";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

/**
 * What gets opened, by whom, and for how long.
 *
 * Two writes and four reads. The writes are the whole of the recording
 * protocol — an open, and a tick of time while the frame is on screen — and
 * everything the home page draws is one of the reads over the totals they
 * keep. See `views`, `userDays` and `activityDays` in `convex/schema.ts` for
 * why the shape is three tables of running totals rather than one log.
 *
 * ## What a number here is worth
 *
 * These are claims from a browser. A client that wanted to could open the
 * activity page in a loop, or send a heartbeat it did not earn, and the counts
 * would move. That is accepted, and the mitigations are sized to match what is
 * at stake: nothing here gates access, spends money, or is shown to anyone but
 * the account that produced it and as one row of a popularity list. So there
 * is a floor between opens and a ceiling on a tick, which is enough to stop a
 * remount or a stuck tab from writing nonsense, and there is no attempt to
 * make the numbers unforgeable. A ranking anyone competes on would need that;
 * a "you have opened this eleven times" does not.
 */

/**
 * Two opens of the same activity inside this window are one open.
 *
 * The client already guards its own double-mount, but that guard is a ref in a
 * component and there are three ways past it that are nobody's fault: React
 * StrictMode, a refresh, and the reload button in the activity's own control
 * bar, which remounts the frame by design. Thirty seconds is longer than all
 * three and far shorter than anyone who bounced off something and came back to
 * it on purpose.
 */
const REOPEN_FLOOR_MS = 30_000;

/**
 * The most one heartbeat may add. The client sends a tick a minute, so this is
 * five of them — enough slack for a laptop that slept through a few and not
 * enough for a tab left open since Tuesday to report eight hours.
 */
const MAX_TICK_SECONDS = 300;

/** How many rows a row of cards will ever ask for. */
const MAX_LIMIT = 24;

/**
 * A slug is checked for shape and not for membership.
 *
 * The catalogue is a 318-entry JSON file under `src/`, and importing it here
 * would bundle the whole thing into every Convex function that touches this
 * module in order to answer a question that does not need it: an unknown slug
 * writes a row nothing ever reads, because every reader resolves the slug back
 * through `findActivity` and drops what it cannot find. So the check is only
 * that the value cannot be used as anything but a key — bounded, and made of
 * the characters a slug is made of.
 */
function validSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 128 && /^[a-z0-9-]+$/.test(slug);
}

async function callerId(ctx: QueryCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

async function viewRow(ctx: QueryCtx, clerkId: string, slug: string) {
  return await ctx.db
    .query("views")
    .withIndex("byUserActivity", (q) =>
      q.eq("clerkId", clerkId).eq("slug", slug),
    )
    .unique();
}

/** Every row this account has, which is bounded by the size of the catalogue. */
async function allViews(ctx: QueryCtx, clerkId: string) {
  return await ctx.db
    .query("views")
    .withIndex("byUserCount", (q) => q.eq("clerkId", clerkId))
    .collect();
}

/** What a row of cards needs to draw one tile. The activity itself is resolved
 *  on the client, out of the catalogue it already has. */
export type ViewedActivity = {
  slug: string;
  count: number;
  seconds: number;
  lastViewedAt: number;
};

function viewed(row: {
  slug: string;
  count: number;
  seconds: number;
  lastViewedAt: number;
}): ViewedActivity {
  return {
    slug: row.slug,
    count: row.count,
    seconds: row.seconds,
    lastViewedAt: row.lastViewedAt,
  };
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return 12;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

/**
 * Records that the caller has opened an activity.
 *
 * Called once when the frame mounts. Everything it writes is additive, so the
 * three tables can be folded in any order and a call that lands twice costs a
 * duplicate rather than a corruption — which is also why the reopen floor is
 * checked against the stored row rather than trusted from the client.
 *
 * Signed-out and malformed calls return quietly rather than throwing. This
 * fires from a `useEffect` with nothing waiting on the answer, so an exception
 * here is an unhandled rejection in someone's console and no more informative
 * for it.
 */
export const opened = mutation({
  args: { slug: v.string(), tzOffsetMinutes: v.number() },
  handler: async (ctx, { slug, tzOffsetMinutes }) => {
    const clerkId = await callerId(ctx);
    if (clerkId === null || !validSlug(slug)) return;

    const now = Date.now();
    const existing = await viewRow(ctx, clerkId, slug);

    if (existing === null) {
      await ctx.db.insert("views", {
        clerkId,
        slug,
        count: 1,
        seconds: 0,
        firstViewedAt: now,
        lastViewedAt: now,
      });
      await recordOpen(ctx, clerkId, slug, now, tzOffsetMinutes);
      return;
    }

    // Inside the floor this is the same open arriving again. The timestamp
    // still moves — you are demonstrably here now, and "jump back in" is
    // ordered by it — but nothing counts.
    if (now - existing.lastViewedAt < REOPEN_FLOOR_MS) {
      await ctx.db.patch(existing._id, { lastViewedAt: now });
      return;
    }

    await ctx.db.patch(existing._id, {
      count: existing.count + 1,
      lastViewedAt: now,
    });
    await recordOpen(ctx, clerkId, slug, now, tzOffsetMinutes);
  },
});

/** The two day rollups a counted open belongs to. */
async function recordOpen(
  ctx: MutationCtx,
  clerkId: string,
  slug: string,
  now: number,
  tzOffsetMinutes: number,
): Promise<void> {
  await foldUserDay(ctx, clerkId, dayKey(now, clampOffset(tzOffsetMinutes)), {
    views: 1,
  });
  await foldActivityDay(ctx, utcDayKey(now), slug, { views: 1 });
}

/**
 * Adds time spent to an activity already open.
 *
 * The client sends one of these a minute while its tab is visible, and one
 * final partial tick as the page goes away. There is deliberately no session
 * to open or close: a tick is self-contained, so a tab that is closed, killed,
 * or put to sleep loses at most the seconds since its last tick rather than
 * the whole sitting.
 *
 * A tick for an activity with no row is dropped rather than creating one. Time
 * spent without an open is not a state the client can reach, so a call in that
 * shape is a stale tab posting after a sign-out, and inventing a row for it
 * would put an activity on the home page that was never opened.
 */
export const heartbeat = mutation({
  args: {
    slug: v.string(),
    seconds: v.number(),
    tzOffsetMinutes: v.number(),
  },
  handler: async (ctx, { slug, seconds, tzOffsetMinutes }) => {
    const clerkId = await callerId(ctx);
    if (clerkId === null || !validSlug(slug)) return;

    if (!Number.isFinite(seconds)) return;
    const tick = Math.min(MAX_TICK_SECONDS, Math.floor(seconds));
    if (tick <= 0) return;

    const existing = await viewRow(ctx, clerkId, slug);
    if (existing === null) return;

    const now = Date.now();
    await ctx.db.patch(existing._id, {
      seconds: existing.seconds + tick,
      lastViewedAt: now,
    });

    await foldUserDay(ctx, clerkId, dayKey(now, clampOffset(tzOffsetMinutes)), {
      seconds: tick,
    });
    await foldActivityDay(ctx, utcDayKey(now), slug, { seconds: tick });
  },
});

/**
 * The caller's most-opened, most first.
 *
 * Ordered by opens rather than by time, because that is the question the card
 * asks — "what do you keep coming back to" — and because time rewards whatever
 * you happened to leave open. The seconds travel with the row anyway, and the
 * card shows both.
 */
export const favourites = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<ViewedActivity[]> => {
    const clerkId = await callerId(ctx);
    if (clerkId === null) return [];

    const rows = await ctx.db
      .query("views")
      .withIndex("byUserCount", (q) => q.eq("clerkId", clerkId))
      .order("desc")
      .take(clampLimit(limit));

    return rows.map(viewed);
  },
});

/** The caller's most recent, newest first. */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<ViewedActivity[]> => {
    const clerkId = await callerId(ctx);
    if (clerkId === null) return [];

    const rows = await ctx.db
      .query("views")
      .withIndex("byUserLastViewed", (q) => q.eq("clerkId", clerkId))
      .order("desc")
      .take(clampLimit(limit));

    return rows.map(viewed);
  },
});

/** One entry on the global board. */
export type PopularActivity = { slug: string; views: number; seconds: number };

/**
 * What everyone is opening today, most first.
 *
 * Not scoped to the caller and deliberately not authenticated: this is the one
 * number on the page that is about the room rather than about you, and there
 * is nothing in a slug and a count that a signed-in visitor should be kept
 * from. It is still only reachable from behind the shell, because that is
 * where the page is.
 *
 * "Today" is the UTC day — see `activityDays` in `convex/schema.ts`. The board
 * can therefore be thin for someone whose evening is the next day's morning in
 * UTC, which is exactly why the client tops it up from the catalogue's own
 * ordering rather than showing whatever few rows exist.
 */
export const popularToday = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<PopularActivity[]> => {
    const rows = await ctx.db
      .query("activityDays")
      .withIndex("byDayViews", (q) => q.eq("day", utcDayKey(Date.now())))
      .order("desc")
      .take(clampLimit(limit));

    return rows.map((row) => ({
      slug: row.slug,
      views: row.views,
      seconds: row.seconds,
    }));
  },
});

/** The numbers on the stats card. */
export type ViewSummary = {
  todaySeconds: number;
  todayViews: number;
  weekSeconds: number;
  weekViews: number;
  /** Distinct activities this account has ever opened. */
  activitiesTried: number;
  totalViews: number;
  totalSeconds: number;
};

const EMPTY_SUMMARY: ViewSummary = {
  todaySeconds: 0,
  todayViews: 0,
  weekSeconds: 0,
  weekViews: 0,
  activitiesTried: 0,
  totalViews: 0,
  totalSeconds: 0,
};

/**
 * Everything the stats card shows, in one subscription.
 *
 * Two reads: seven day rows for the windowed numbers, and the account's whole
 * `views` table for the all-time ones. The second sounds like the expensive
 * half and is not — there is one row per activity you have ever opened, so it
 * is bounded by the catalogue at 318 short documents, and it is the only way
 * to get a *distinct* count without keeping a running total that nothing else
 * needs.
 */
export const summary = query({
  args: { tzOffsetMinutes: v.number() },
  handler: async (ctx, { tzOffsetMinutes }): Promise<ViewSummary> => {
    const clerkId = await callerId(ctx);
    if (clerkId === null) return EMPTY_SUMMARY;

    const offset = clampOffset(tzOffsetMinutes);
    const today = dayKey(Date.now(), offset);
    // The same Monday-to-Sunday week the streak strip draws, and for the same
    // reason it is not a rolling seven days: the card beside this one is
    // labelled M T W T F S S, and two cards on one page saying "this week"
    // about two different weeks is the kind of thing nobody reports and
    // everybody half-notices.
    const days = weekWindow(today);

    const rows = await userDaysBetween(ctx, clerkId, days[0], today);
    const todayRow = rows.find((row) => row.day === today);

    const views = await allViews(ctx, clerkId);

    return {
      todaySeconds: todayRow?.seconds ?? 0,
      todayViews: todayRow?.views ?? 0,
      weekSeconds: rows.reduce((sum, row) => sum + row.seconds, 0),
      weekViews: rows.reduce((sum, row) => sum + row.views, 0),
      activitiesTried: views.length,
      totalViews: views.reduce((sum, row) => sum + row.count, 0),
      totalSeconds: views.reduce((sum, row) => sum + row.seconds, 0),
    };
  },
});
