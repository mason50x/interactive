/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import catalogue from "../../src/lib/activities.catalogue.json";
import { gameViewLabel, rankGames } from "../../src/lib/game-popularity";
import type { ActivityEntry } from "../../src/lib/activity";
const modules = import.meta.glob("../../convex/**/*.ts");
const DAY = 86_400_000;
afterEach(() => vi.useRealTimers());

test("views require auth and a real game; duplicates coalesce and histories stay private", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(20 * DAY);
  const t = convexTest(schema, modules);
  const one = t.withIdentity({ subject: "one" });
  const two = t.withIdentity({ subject: "two" });
  const slug = catalogue[0].slug;
  await expect(t.mutation(api.gameViews.record, { slug })).rejects.toThrow(
    "Sign in",
  );
  await expect(
    one.mutation(api.gameViews.record, { slug: "invalid" }),
  ).rejects.toThrow("Unknown");
  await one.mutation(api.gameViews.record, { slug });
  await one.mutation(api.gameViews.record, { slug });
  expect((await one.query(api.gameViews.recent, {}))[0].views).toBe(1);
  expect(await two.query(api.gameViews.recent, {})).toEqual([]);
  await two.mutation(api.gameViews.record, { slug });
  expect(
    (await one.query(api.gameViews.popularity, { day: 20 }))[0].weeklyViews,
  ).toBe(2);
  expect(await t.query(api.gameViews.popularity, { day: 20 })).toEqual([]);
});

test("recent is ten distinct games ordered by latest open; old weekly buckets expire", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(20 * DAY);
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "one" });
  for (let i = 0; i < 12; i++) {
    vi.setSystemTime(20 * DAY + i * 61_000);
    await user.mutation(api.gameViews.record, { slug: catalogue[i].slug });
  }
  const recent = await user.query(api.gameViews.recent, {});
  expect(recent).toHaveLength(10);
  expect(recent[0].slug).toBe(catalogue[11].slug);
  vi.setSystemTime(27 * DAY);
  expect(
    (await user.query(api.gameViews.popularity, { day: 27 })).every(
      (row) => row.weeklyViews === 0,
    ),
  ).toBe(true);
  for (let day = 27; day < 40; day++) {
    vi.setSystemTime(day * DAY);
    await user.mutation(api.gameViews.record, { slug: catalogue[0].slug });
  }
  expect((await user.query(api.gameViews.recent, {}))[0].slug).toBe(
    catalogue[0].slug,
  );
  const rows = await t.run((ctx) => ctx.db.query("globalGameViews").collect());
  expect(rows.find((row) => row.slug === catalogue[0].slug)?.days).toHaveLength(
    7,
  );
  const top = (await user.query(api.gameViews.popularity, { day: 39 }))[0];
  expect(top.weeklyViews).toBe(7);
  expect(top.views).toBe(14);
});

test("real weekly counts drive ranking, lifetime breaks ties, and labels reflect counts", () => {
  const games = catalogue.slice(0, 3) as ActivityEntry[];
  const ranked = rankGames(games, [
    { slug: games[0].slug, weeklyViews: 1, views: 100 },
    { slug: games[1].slug, weeklyViews: 2, views: 3 },
    { slug: games[2].slug, weeklyViews: 2, views: 4 },
  ]);
  expect(ranked.map((game) => game.slug)).toEqual([
    games[2].slug,
    games[1].slug,
    games[0].slug,
  ]);
  expect(gameViewLabel(1, 2)).toBe("#2 · 1 view in the last 7 days");
  expect(gameViewLabel(0)).toBe("0 views in the last 7 days");
});
