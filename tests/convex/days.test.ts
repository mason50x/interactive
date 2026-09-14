import { expect, test } from "vitest";
import {
  DAY_MS,
  clampOffset,
  dayKey,
  foldActivityDay,
  foldUserDay,
  userDay,
  userDaysBetween,
  utcDayKey,
  weekWindow,
} from "@convex/days";
import { makeConvexTest } from "../helpers/convex";

test("dayKey slides the instant onto the caller's wall clock around midnight", () => {
  const at = Date.parse("2026-09-14T03:00:00Z");
  // UTC reads the 14th; New York (UTC-5, offset +300) is still on the 13th.
  expect(dayKey(at, 0)).toBe("2026-09-14");
  expect(dayKey(at, 300)).toBe("2026-09-13");
  // Sydney (UTC+10, offset -600) at 15:00Z is already on the 14th.
  const evening = Date.parse("2026-09-13T15:00:00Z");
  expect(dayKey(evening, 0)).toBe("2026-09-13");
  expect(dayKey(evening, -600)).toBe("2026-09-14");
  // Exactly midnight local is the new day; a minute before is not.
  const midnightNy = Date.parse("2026-09-14T05:00:00Z");
  expect(dayKey(midnightNy, 300)).toBe("2026-09-14");
  expect(dayKey(midnightNy - 60_000, 300)).toBe("2026-09-13");
  // Kiribati (UTC+14) and Baker Island (UTC-12) are 26 hours apart.
  expect(dayKey(at, -840)).toBe("2026-09-14");
  expect(dayKey(Date.parse("2026-09-14T11:59:00Z"), 720)).toBe("2026-09-13");
});

test("utcDayKey ignores offsets entirely", () => {
  expect(utcDayKey(Date.parse("2026-09-14T00:00:00Z"))).toBe("2026-09-14");
  expect(utcDayKey(Date.parse("2026-09-14T23:59:59.999Z"))).toBe("2026-09-14");
  expect(utcDayKey(Date.parse("2026-09-15T00:00:00Z"))).toBe("2026-09-15");
  expect(utcDayKey(0)).toBe("1970-01-01");
});

test("clampOffset bounds to -14:00..+12:00, rounds, and treats junk as UTC", () => {
  expect(clampOffset(0)).toBe(0);
  expect(clampOffset(300)).toBe(300);
  expect(clampOffset(-600)).toBe(-600);
  expect(clampOffset(720)).toBe(720);
  expect(clampOffset(-840)).toBe(-840);
  expect(clampOffset(721)).toBe(720);
  expect(clampOffset(-841)).toBe(-840);
  expect(clampOffset(100_000)).toBe(720);
  expect(clampOffset(-100_000)).toBe(-840);
  expect(clampOffset(59.6)).toBe(60);
  expect(clampOffset(-0.4) === 0).toBe(true);
  expect(clampOffset(Number.NaN)).toBe(0);
  expect(clampOffset(Number.POSITIVE_INFINITY)).toBe(0);
  expect(clampOffset(Number.NEGATIVE_INFINITY)).toBe(0);
});

test("weekWindow is Monday to Sunday for any day in the week", () => {
  const week = [
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
    "2026-09-20",
  ];
  // Wednesday, Monday itself, and Sunday all land on the same week.
  expect(weekWindow("2026-09-16")).toEqual(week);
  expect(weekWindow("2026-09-14")).toEqual(week);
  expect(weekWindow("2026-09-20")).toEqual(week);
  // The next Monday starts a new one, and a week can straddle a month end.
  expect(weekWindow("2026-09-21")[0]).toBe("2026-09-21");
  expect(weekWindow("2026-10-01")).toEqual([
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2026-10-04",
  ]);
  expect(DAY_MS).toBe(86_400_000);
});

test("foldUserDay creates then accumulates, and visited latches", async () => {
  const t = makeConvexTest();
  await t.run(async (ctx) => {
    await foldUserDay(ctx, "alice", "2026-09-14", { views: 1 });
    expect(await userDay(ctx, "alice", "2026-09-14")).toMatchObject({
      clerkId: "alice",
      day: "2026-09-14",
      visited: false,
      views: 1,
      seconds: 0,
    });

    await foldUserDay(ctx, "alice", "2026-09-14", { seconds: 60 });
    await foldUserDay(ctx, "alice", "2026-09-14", { visited: true });
    await foldUserDay(ctx, "alice", "2026-09-14", { views: 2, seconds: 30 });
    expect(await userDay(ctx, "alice", "2026-09-14")).toMatchObject({
      visited: true,
      views: 3,
      seconds: 90,
    });
    // A later fold that says nothing about `visited` cannot unset it, and
    // an explicit false cannot either.
    await foldUserDay(ctx, "alice", "2026-09-14", { visited: false });
    expect((await userDay(ctx, "alice", "2026-09-14"))?.visited).toBe(true);

    // Other accounts and other days are other rows.
    await foldUserDay(ctx, "bob", "2026-09-14", { views: 1 });
    await foldUserDay(ctx, "alice", "2026-09-15", { views: 1 });
    expect(await ctx.db.query("userDays").collect()).toHaveLength(3);
    expect(await userDay(ctx, "alice", "2026-09-13")).toBeNull();
  });
});

test("foldActivityDay accumulates per UTC day per slug", async () => {
  const t = makeConvexTest();
  await t.run(async (ctx) => {
    await foldActivityDay(ctx, "2026-09-14", "snake", { views: 1 });
    await foldActivityDay(ctx, "2026-09-14", "snake", { seconds: 45 });
    await foldActivityDay(ctx, "2026-09-14", "snake", {});
    await foldActivityDay(ctx, "2026-09-14", "tetris", { views: 2 });
    await foldActivityDay(ctx, "2026-09-15", "snake", { views: 1 });
    const rows = (await ctx.db.query("activityDays").collect())
      .map(({ day, slug, views, seconds }) => ({ day, slug, views, seconds }))
      .sort((a, b) => `${a.day}${a.slug}`.localeCompare(`${b.day}${b.slug}`));
    expect(rows).toEqual([
      { day: "2026-09-14", slug: "snake", views: 1, seconds: 45 },
      { day: "2026-09-14", slug: "tetris", views: 2, seconds: 0 },
      { day: "2026-09-15", slug: "snake", views: 1, seconds: 0 },
    ]);
  });
});

test("userDaysBetween is inclusive at both ends, oldest first, and scoped to one account", async () => {
  const t = makeConvexTest();
  await t.run(async (ctx) => {
    for (const day of ["2026-09-10", "2026-09-12", "2026-09-14", "2026-09-16"]) {
      await foldUserDay(ctx, "alice", day, { views: 1 });
    }
    await foldUserDay(ctx, "bob", "2026-09-13", { views: 1 });

    const rows = await userDaysBetween(ctx, "alice", "2026-09-12", "2026-09-14");
    expect(rows.map((row) => row.day)).toEqual(["2026-09-12", "2026-09-14"]);
    expect(rows.every((row) => row.clerkId === "alice")).toBe(true);
    expect(
      (await userDaysBetween(ctx, "alice", "2026-09-01", "2026-09-30")).map(
        (row) => row.day,
      ),
    ).toEqual(["2026-09-10", "2026-09-12", "2026-09-14", "2026-09-16"]);
    expect(await userDaysBetween(ctx, "alice", "2026-09-13", "2026-09-13")).toEqual([]);
    expect(await userDaysBetween(ctx, "carol", "2026-09-01", "2026-09-30")).toEqual([]);
  });
});
