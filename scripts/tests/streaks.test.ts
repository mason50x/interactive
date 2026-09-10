/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.useRealTimers());

async function setup(last = "2026-09-04") {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("users", {
      clerkId: "alice",
      streakCount: 5,
      streakBest: 8,
      streakLastDay: last,
    }),
  );
  return t.withIdentity({ subject: "alice" });
}

for (const date of ["2026-09-05", "2026-09-06"]) {
  test(`${date}: weekend preserves count without claiming`, async () => {
    const t = await setup();
    vi.setSystemTime(new Date(`${date}T12:00:00Z`));
    expect(
      await t.mutation(api.streaks.claimToday, { tzOffsetMinutes: 0 }),
    ).toEqual({
      current: 5,
      best: 8,
      countedToday: false,
      extended: false,
      deferred: false,
    });
    const week = await t.query(api.streaks.week, { tzOffsetMinutes: 0 });
    expect(week.map((d) => d.day)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
    expect(week.every((d) => !d.today)).toBe(true);
  });
}

test("Monday continues Friday once and backfills only weekdays", async () => {
  const t = await setup();
  vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  expect(
    (await t.query(api.streaks.mine, { tzOffsetMinutes: 0 })).current,
  ).toBe(5);
  expect(
    await t.mutation(api.streaks.claimToday, { tzOffsetMinutes: 0 }),
  ).toMatchObject({ current: 6, extended: true });
  expect(
    await t.mutation(api.streaks.claimToday, { tzOffsetMinutes: 0 }),
  ).toMatchObject({ current: 6, extended: false });
  const week = await t.query(api.streaks.week, { tzOffsetMinutes: 0 });
  expect(week.map((d) => d.visited)).toEqual([
    true,
    false,
    false,
    false,
    false,
  ]);
  const rows = await t.run((ctx) => ctx.db.query("userDays").collect());
  expect(
    rows.some((r) =>
      [0, 6].includes(new Date(`${r.day}T00:00:00Z`).getUTCDay()),
    ),
  ).toBe(false);
});

for (const [last, now] of [
  ["2026-09-04", "2026-09-08"],
  ["2026-09-03", "2026-09-05"],
]) {
  test(`missed weekday lapses ${last} to ${now}`, async () => {
    const t = await setup(last);
    vi.setSystemTime(new Date(`${now}T12:00:00Z`));
    expect(
      (await t.query(api.streaks.mine, { tzOffsetMinutes: 0 })).current,
    ).toBe(0);
    expect(
      await t.mutation(api.streaks.claimToday, { tzOffsetMinutes: 0 }),
    ).toMatchObject({ current: now.endsWith("08") ? 1 : 0, best: 8 });
  });
}

test("weekday boundary uses caller offset and tolerates legacy weekend claims", async () => {
  const t = await setup("2026-09-06");
  vi.setSystemTime(new Date("2026-09-07T02:00:00Z"));
  expect(
    await t.mutation(api.streaks.claimToday, { tzOffsetMinutes: 300 }),
  ).toMatchObject({ current: 5, extended: false });
  expect(
    await t.mutation(api.streaks.claimToday, { tzOffsetMinutes: -120 }),
  ).toMatchObject({ current: 6, extended: true });
});
