/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api, components } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
const DAY = 86_400_000;
const start = Date.UTC(2026, 8, 15, 12);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
  vi.stubEnv("CHAT_ADMIN_CLERK_IDS", "admin");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function setup(subject = "person") {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return { t, user: t.withIdentity({ subject }) };
}

test("requires authentication and reads do not spend time or create records", async () => {
  const { t, user } = setup();
  await expect(t.mutation(api.experience.acquire, {})).rejects.toThrow(
    "Sign in",
  );
  const status = await user.query(api.experience.status, { day: 0 });
  expect(status.remainingSeconds).toBe(600);
  expect(status.resetsAt).toBe(Math.floor(start / DAY) * DAY + DAY);
  expect(
    await t.run((ctx) => ctx.db.query("experienceLeases").take(10)),
  ).toEqual([]);
});

test("reloads and concurrent tabs reuse one lease; regular accounts stop at ten minutes", async () => {
  const { t, user } = setup();
  const results = await Promise.all([
    user.mutation(api.experience.acquire, {}),
    user.mutation(api.experience.acquire, {}),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0].remainingSeconds).toBe(585);
  for (let i = 1; i < 40; i++) {
    vi.setSystemTime(start + i * 15_000);
    await user.mutation(api.experience.acquire, {});
  }
  vi.setSystemTime(start + 600_000);
  const exhausted = await user.mutation(api.experience.acquire, {});
  expect(exhausted.remainingSeconds).toBe(0);
  expect(exhausted.leaseUntil).toBe(start + 600_000);
  expect(
    await t.run((ctx) => ctx.db.query("experienceLeases").take(10)),
  ).toHaveLength(1);
});

test("only server-authorized admins receive five hours, independently of other accounts", async () => {
  vi.stubEnv("NEXT_PUBLIC_CHAT_ADMIN_CLERK_IDS", "impostor");
  const { t, user } = setup("admin");
  const result = await user.mutation(api.experience.acquire, {});
  expect(result.allowanceSeconds).toBe(18_000);
  expect(result.remainingSeconds).toBe(17_985);
  const other = await t
    .withIdentity({ subject: "impostor", name: "admin" })
    .mutation(api.experience.acquire, {});
  expect(other.remainingSeconds).toBe(585);
});

test("early renewal never reserves more than fifteen seconds ahead", async () => {
  const { user } = setup();
  await user.mutation(api.experience.acquire, {});
  vi.setSystemTime(start + 10_000);
  const result = await user.mutation(api.experience.acquire, {});
  expect(result.leaseUntil).toBe(start + 25_000);
  expect(result.remainingSeconds).toBe(575);
});

test("idle time is not charged; only short prepaid intervals are consumed", async () => {
  const { user } = setup();
  await user.mutation(api.experience.acquire, {});
  vi.setSystemTime(start + 3_600_000);
  const result = await user.mutation(api.experience.acquire, {});
  expect(result.remainingSeconds).toBe(570);
  expect(result.leaseUntil).toBe(start + 3_615_000);
});

test("midnight clips the lease, restores quota, and deletes old limiter and lease records", async () => {
  const { t, user } = setup();
  const midnight = Math.floor(start / DAY) * DAY + DAY;
  vi.setSystemTime(midnight - 2_000);
  const result = await user.mutation(api.experience.acquire, {});
  expect(result.leaseUntil).toBe(midnight);
  expect(result.remainingSeconds).toBe(598);
  vi.setSystemTime(midnight);
  // Create the next day's state before running delayed cleanup of yesterday.
  const next = await user.mutation(api.experience.acquire, {});
  expect(next.remainingSeconds).toBe(585);
  await t.finishInProgressScheduledFunctions();
  // Run just yesterday's scheduled cleanup (not tomorrow's).
  await vi.advanceTimersByTimeAsync(2_000);
  await t.finishInProgressScheduledFunctions();
  const rows = await t.run((ctx) => ctx.db.query("experienceLeases").take(10));
  expect(rows).toHaveLength(1);
  expect(rows[0].day).toBe(Math.floor(midnight / DAY));
  const old = await t.run((ctx) =>
    ctx.runQuery(components.rateLimiter.lib.getValue, {
      name: "experienceSeconds",
      key: `person:${Math.floor(start / DAY)}`,
      config: {
        kind: "fixed window",
        rate: 600,
        period: DAY,
        start: Math.floor(start / DAY) * DAY,
      },
    }),
  );
  expect(old.ts).toBe(0);
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(585);
});

test("leaving returns unused seconds and the overview stays frozen", async () => {
  const { user } = setup();
  await user.mutation(api.experience.acquire, { sessionId: "tab" });
  vi.setSystemTime(start + 3_000);
  await user.mutation(api.experience.release, { sessionId: "tab" });
  const stopped = await user.query(api.experience.status, { day: 0 });
  expect(stopped.remainingSeconds).toBe(597);
  expect(stopped.leaseUntil).toBe(start + 3_000);
  vi.setSystemTime(start + 3_600_000);
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(597);
  await user.mutation(api.experience.release, { sessionId: "tab" });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(597);
});

test("closing one tab does not refund time reserved by another active tab", async () => {
  const { user } = setup();
  await user.mutation(api.experience.acquire, { sessionId: "one" });
  await user.mutation(api.experience.acquire, { sessionId: "two" });
  vi.setSystemTime(start + 2_000);
  await user.mutation(api.experience.release, { sessionId: "one" });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(585);
  vi.setSystemTime(start + 5_000);
  await user.mutation(api.experience.release, { sessionId: "two" });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(595);
});

test("delayed closes cannot stop a new session or refund another account", async () => {
  const { t, user } = setup();
  await user.mutation(api.experience.acquire, { sessionId: "old" });
  vi.setSystemTime(start + 2_000);
  await user.mutation(api.experience.acquire, { sessionId: "resumed" });
  await user.mutation(api.experience.release, { sessionId: "old" });
  await t
    .withIdentity({ subject: "other" })
    .mutation(api.experience.release, { sessionId: "resumed" });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(585);
  vi.setSystemTime(start + 4_000);
  await user.mutation(api.experience.release, { sessionId: "resumed" });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(596);
});

test("existing five-minute accounts gain five minutes without losing time already used", async () => {
  const { t, user } = setup();
  await user.mutation(api.experience.acquire, { sessionId: "old" });
  await t.run(async (ctx) => {
    const row = await ctx.db.query("experienceLeases").first();
    await ctx.db.patch(row!._id, { allowanceSeconds: undefined });
    await ctx.runMutation(components.rateLimiter.lib.rateLimit, {
      name: "experienceSeconds",
      key: `person:${Math.floor(start / DAY)}`,
      count: 300,
      config: {
        kind: "fixed window",
        rate: 600,
        period: DAY,
        start: Math.floor(start / DAY) * DAY,
      },
    });
  });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(585);
  await user.mutation(api.experience.acquire, { sessionId: "old" });
  await user.mutation(api.experience.acquire, { sessionId: "old" });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(585);
});
