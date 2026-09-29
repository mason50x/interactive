/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api, internal } from "../../convex/_generated/api";
import { addScore, pageKey } from "../../convex/leaderboard";
import schema from "../../convex/schema";
import { admit } from "./invited";

const modules = import.meta.glob("../../convex/**/*.ts");
const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 23, 12);
afterEach(() => vi.useRealTimers());
async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  await admit(t, "one", "two");
  return {
    t,
    one: t.withIdentity({ subject: "one", name: "Ada" }),
    two: t.withIdentity({ subject: "two", name: "Bo" }),
  };
}

test("ranked playtime is charged once and unused reserved time is refunded", async () => {
  const { t, one, two } = await setup();
  await one.mutation(api.users.store, {});
  await two.mutation(api.users.store, {});
  await one.mutation(api.experience.acquire, { sessionId: "tab" });
  await one.mutation(api.experience.acquire, { sessionId: "tab" });
  let board = await one.query(api.leaderboard.standings, {
    metric: "playtime",
    period: "all",
    clock: Math.floor(now / DAY),
  });
  expect(board.people.map((row) => row.score)).toEqual([15]);
  vi.setSystemTime(now + 5_000);
  await one.mutation(api.experience.release, { sessionId: "tab" });
  await two.mutation(api.experience.acquire, {});
  board = await one.query(api.leaderboard.standings, {
    metric: "playtime",
    period: "all",
    clock: Math.floor(now / DAY),
  });
  expect(board.people.map((row) => row.score)).toEqual([15, 5]);
  expect(
    await t.query(api.leaderboard.standings, {
      metric: "playtime",
      period: "all",
      clock: Math.floor(now / DAY),
    }),
  ).toEqual({ people: [], pages: [] });
});

test("chat buckets roll over and expire without touching lifetime playtime", async () => {
  const { t, one } = await setup();
  await one.mutation(api.users.store, {});
  await t.run((ctx) => addScore(ctx, "one", "chat", 3, now));
  await t.run((ctx) => addScore(ctx, "one", "playtime", 70, now));
  let board = await one.query(api.leaderboard.standings, {
    metric: "chat",
    period: "day",
    clock: Math.floor(now / DAY),
  });
  expect(board.people[0].score).toBe(3);
  vi.setSystemTime(now + DAY);
  board = await one.query(api.leaderboard.standings, {
    metric: "chat",
    period: "day",
    clock: Math.floor((now + DAY) / DAY),
  });
  expect(board.people).toEqual([]);
  expect(
    (
      await one.query(api.leaderboard.standings, {
        metric: "playtime",
        period: "all",
        clock: Math.floor((now + DAY) / DAY),
      })
    ).people[0].score,
  ).toBe(70);
  vi.setSystemTime(now + 401 * DAY);
  await t.mutation(internal.leaderboard.prune, {});
  expect(
    await t.run((ctx) => ctx.db.query("leaderboardScores").collect()),
  ).toHaveLength(1);
});

test("chat week standings count Monday to Friday only", async () => {
  const { t, one } = await setup();
  await one.mutation(api.users.store, {});
  const saturday = Date.UTC(2026, 8, 26, 12);
  const sunday = Date.UTC(2026, 8, 27, 12);
  const monday = Date.UTC(2026, 8, 28, 12);
  await t.run((ctx) => addScore(ctx, "one", "chat", 2, now)); // Wednesday
  await t.run((ctx) => addScore(ctx, "one", "chat", 5, saturday));
  await t.run((ctx) => addScore(ctx, "one", "chat", 5, sunday));
  vi.setSystemTime(sunday);
  const week = await one.query(api.leaderboard.standings, {
    metric: "chat",
    period: "week",
    clock: Math.floor(sunday / DAY),
  });
  expect(week.people.map((row) => row.score)).toEqual([2]);
  const month = await one.query(api.leaderboard.standings, {
    metric: "chat",
    period: "month",
    clock: Math.floor(sunday / DAY),
  });
  expect(month.people.map((row) => row.score)).toEqual([12]);
  await t.run((ctx) => addScore(ctx, "one", "chat", 1, monday));
  vi.setSystemTime(monday);
  const nextWeek = await one.query(api.leaderboard.standings, {
    metric: "chat",
    period: "week",
    clock: Math.floor(monday / DAY),
  });
  expect(nextWeek.people.map((row) => row.score)).toEqual([1]);
});

test("page views coalesce heartbeats, require auth, and only count known sections", async () => {
  const { t, one } = await setup();
  expect(pageKey("/chat/room")).toBe("/chat");
  expect(pageKey("/unknown")).toBeNull();
  expect(pageKey("/admin")).toBeNull();
  await t.mutation(api.users.heartbeat, { path: "/chat" });
  await one.mutation(api.users.heartbeat, { path: "/chat/room" });
  vi.setSystemTime(now + 20_000);
  await one.mutation(api.users.heartbeat, { path: "/chat/other" });
  await one.mutation(api.users.heartbeat, { path: "/activities" });
  vi.setSystemTime(now + 61_000);
  await one.mutation(api.users.heartbeat, { path: "/chat" });
  const board = await one.query(api.leaderboard.standings, {
    metric: "pages",
    period: "day",
    clock: Math.floor(now / DAY),
  });
  expect(board.pages).toEqual([{ path: "/chat", views: 2 }]);
});
