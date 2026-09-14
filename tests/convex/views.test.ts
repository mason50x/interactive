import { afterEach, expect, test, vi } from "vitest";
import { api } from "@convex/_generated/api";
import { actor, makeConvexTest } from "../helpers/convex";

afterEach(() => vi.useRealTimers());

/** New York in September: UTC-4, so `getTimezoneOffset()` is 240. */
const tz = { tzOffsetMinutes: 240 };

/**
 * 03:00Z on the 14th, which is still the evening of the 13th in New York.
 * The two day tables therefore disagree about which day this is, on purpose.
 */
function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T03:00:00Z"));
  const t = makeConvexTest();
  return { t, alice: actor(t, "alice") };
}

async function tables(t: ReturnType<typeof makeConvexTest>) {
  return await t.run(async (ctx) => ({
    views: (await ctx.db.query("views").collect()).map(
      ({ clerkId, slug, count, seconds, firstViewedAt, lastViewedAt }) => ({
        clerkId,
        slug,
        count,
        seconds,
        firstViewedAt,
        lastViewedAt,
      }),
    ),
    userDays: (await ctx.db.query("userDays").collect()).map(
      ({ clerkId, day, visited, views, seconds }) => ({
        clerkId,
        day,
        visited,
        views,
        seconds,
      }),
    ),
    activityDays: (await ctx.db.query("activityDays").collect()).map(
      ({ day, slug, views, seconds }) => ({ day, slug, views, seconds }),
    ),
  }));
}

test("opened records a view and folds it into the local and UTC day rows", async () => {
  const { t, alice } = setup();
  const now = Date.now();
  await alice.mutation(api.views.opened, { slug: "snake", ...tz });
  expect(await tables(t)).toEqual({
    views: [
      {
        clerkId: "alice",
        slug: "snake",
        count: 1,
        seconds: 0,
        firstViewedAt: now,
        lastViewedAt: now,
      },
    ],
    userDays: [
      { clerkId: "alice", day: "2026-09-13", visited: false, views: 1, seconds: 0 },
    ],
    activityDays: [{ day: "2026-09-14", slug: "snake", views: 1, seconds: 0 }],
  });
});

test("a reopen inside the floor moves the timestamp only; past it, everything counts", async () => {
  const { t, alice } = setup();
  const t0 = Date.now();
  await alice.mutation(api.views.opened, { slug: "snake", ...tz });
  vi.setSystemTime(t0 + 29_999);
  await alice.mutation(api.views.opened, { slug: "snake", ...tz });
  let state = await tables(t);
  expect(state.views[0]).toMatchObject({
    count: 1,
    firstViewedAt: t0,
    lastViewedAt: t0 + 29_999,
  });
  expect(state.userDays[0].views).toBe(1);
  expect(state.activityDays[0].views).toBe(1);

  vi.setSystemTime(t0 + 29_999 + 30_000);
  await alice.mutation(api.views.opened, { slug: "snake", ...tz });
  state = await tables(t);
  expect(state.views[0]).toMatchObject({
    count: 2,
    firstViewedAt: t0,
    lastViewedAt: t0 + 59_999,
  });
  expect(state.userDays[0].views).toBe(2);
  expect(state.activityDays[0].views).toBe(2);
});

test("signed-out calls and malformed slugs write nothing", async () => {
  const { t, alice } = setup();
  await t.mutation(api.views.opened, { slug: "snake", ...tz });
  for (const slug of ["", "Snake", "snake game", "snake_game", "../snake", "a".repeat(129)]) {
    await alice.mutation(api.views.opened, { slug, ...tz });
    await alice.mutation(api.views.heartbeat, { slug, seconds: 60, ...tz });
  }
  expect(await tables(t)).toEqual({ views: [], userDays: [], activityDays: [] });
  // The bounds themselves are fine.
  await alice.mutation(api.views.opened, { slug: "a".repeat(128), ...tz });
  await alice.mutation(api.views.opened, { slug: "2048-game", ...tz });
  expect((await tables(t)).views).toHaveLength(2);
});

test("heartbeat adds bounded seconds to an open row and drops ticks with no row", async () => {
  const { t, alice } = setup();
  const t0 = Date.now();
  // Time spent without an open is a stale tab: nothing is invented.
  await alice.mutation(api.views.heartbeat, { slug: "snake", seconds: 60, ...tz });
  expect(await tables(t)).toEqual({ views: [], userDays: [], activityDays: [] });

  await alice.mutation(api.views.opened, { slug: "snake", ...tz });
  vi.setSystemTime(t0 + 60_000);
  await alice.mutation(api.views.heartbeat, { slug: "snake", seconds: 60.9, ...tz });
  // Capped at MAX_TICK_SECONDS; nothing else about the tick is trusted.
  await alice.mutation(api.views.heartbeat, { slug: "snake", seconds: 28_800, ...tz });
  for (const seconds of [0, -5, 0.4, Number.NaN, Number.POSITIVE_INFINITY]) {
    await alice.mutation(api.views.heartbeat, { slug: "snake", seconds, ...tz });
  }
  const state = await tables(t);
  expect(state.views[0]).toMatchObject({
    count: 1,
    seconds: 360,
    lastViewedAt: t0 + 60_000,
  });
  expect(state.userDays).toEqual([
    { clerkId: "alice", day: "2026-09-13", visited: false, views: 1, seconds: 360 },
  ]);
  expect(state.activityDays).toEqual([
    { day: "2026-09-14", slug: "snake", views: 1, seconds: 360 },
  ]);
});

test("favourites orders by opens, recent by last viewed, both bounded by limit", async () => {
  const { t, alice } = setup();
  const t0 = Date.now();
  await t.run(async (ctx) => {
    const rows = [
      ["snake", 5, 100, t0 - 3_000],
      ["tetris", 9, 10, t0 - 1_000],
      ["pong", 1, 900, t0 - 2_000],
      ["chess", 3, 0, t0 - 4_000],
    ] as const;
    for (const [slug, count, seconds, lastViewedAt] of rows) {
      await ctx.db.insert("views", {
        clerkId: "alice",
        slug,
        count,
        seconds,
        firstViewedAt: t0 - 10_000,
        lastViewedAt,
      });
    }
    await ctx.db.insert("views", {
      clerkId: "bob",
      slug: "asteroids",
      count: 99,
      seconds: 0,
      firstViewedAt: t0,
      lastViewedAt: t0,
    });
  });

  expect(
    (await alice.query(api.views.favourites, {})).map((row) => row.slug),
  ).toEqual(["tetris", "snake", "chess", "pong"]);
  expect(await alice.query(api.views.favourites, { limit: 2 })).toEqual([
    { slug: "tetris", count: 9, seconds: 10, lastViewedAt: t0 - 1_000 },
    { slug: "snake", count: 5, seconds: 100, lastViewedAt: t0 - 3_000 },
  ]);
  expect(
    (await alice.query(api.views.recent, {})).map((row) => row.slug),
  ).toEqual(["tetris", "pong", "snake", "chess"]);
  // Limits are clamped into 1..24 rather than refused.
  expect(await alice.query(api.views.recent, { limit: 0 })).toHaveLength(1);
  expect(await alice.query(api.views.recent, { limit: 1.9 })).toHaveLength(1);
  expect(await alice.query(api.views.recent, { limit: 500 })).toHaveLength(4);
  // Signed out sees nothing.
  expect(await t.query(api.views.favourites, {})).toEqual([]);
  expect(await t.query(api.views.recent, {})).toEqual([]);
});

test("popularToday reads the UTC day across everybody, most opened first", async () => {
  const { t } = setup();
  await t.run(async (ctx) => {
    for (const [day, slug, views] of [
      ["2026-09-14", "snake", 4],
      ["2026-09-14", "tetris", 9],
      ["2026-09-14", "pong", 1],
      ["2026-09-13", "chess", 50],
      ["2026-09-15", "chess", 50],
    ] as const) {
      await ctx.db.insert("activityDays", { day, slug, views, seconds: views * 10 });
    }
  });
  // No identity needed.
  expect(await t.query(api.views.popularToday, {})).toEqual([
    { slug: "tetris", views: 9, seconds: 90 },
    { slug: "snake", views: 4, seconds: 40 },
    { slug: "pong", views: 1, seconds: 10 },
  ]);
  expect(await t.query(api.views.popularToday, { limit: 1 })).toEqual([
    { slug: "tetris", views: 9, seconds: 90 },
  ]);
  // Tomorrow in UTC is a different board.
  vi.setSystemTime(new Date("2026-09-15T00:00:00Z"));
  expect(await t.query(api.views.popularToday, {})).toEqual([
    { slug: "chess", views: 50, seconds: 500 },
  ]);
});

test("summary sums the caller's Monday-to-Sunday week in their own local day", async () => {
  const { t, alice } = setup();
  // Locally it is Sunday the 13th, so the week is Sep 7..13.
  await t.run(async (ctx) => {
    for (const [day, views, seconds] of [
      ["2026-09-06", 7, 700], // last week's Sunday: out
      ["2026-09-07", 1, 100], // Monday: in
      ["2026-09-10", 2, 200],
      ["2026-09-13", 3, 300], // today
      ["2026-09-14", 4, 400], // tomorrow locally: out
    ] as const) {
      await ctx.db.insert("userDays", {
        clerkId: "alice",
        day,
        visited: true,
        views,
        seconds,
      });
    }
    await ctx.db.insert("userDays", {
      clerkId: "bob",
      day: "2026-09-13",
      visited: true,
      views: 99,
      seconds: 999,
    });
    for (const [slug, count, seconds] of [
      ["snake", 5, 100],
      ["tetris", 9, 10],
    ] as const) {
      await ctx.db.insert("views", {
        clerkId: "alice",
        slug,
        count,
        seconds,
        firstViewedAt: 0,
        lastViewedAt: 0,
      });
    }
  });

  expect(await alice.query(api.views.summary, tz)).toEqual({
    todaySeconds: 300,
    todayViews: 3,
    weekSeconds: 600,
    weekViews: 6,
    activitiesTried: 2,
    totalViews: 14,
    totalSeconds: 110,
  });
  // The same instant read as UTC is Monday the 14th: a fresh week, and the
  // row for the 14th becomes today.
  expect(await alice.query(api.views.summary, { tzOffsetMinutes: 0 })).toMatchObject({
    todaySeconds: 400,
    todayViews: 4,
    weekSeconds: 400,
    weekViews: 4,
  });
  // Signed out is the empty card, not an error.
  expect(await t.query(api.views.summary, tz)).toEqual({
    todaySeconds: 0,
    todayViews: 0,
    weekSeconds: 0,
    weekViews: 0,
    activitiesTried: 0,
    totalViews: 0,
    totalSeconds: 0,
  });
});
