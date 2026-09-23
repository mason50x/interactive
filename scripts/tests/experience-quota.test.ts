/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api, components } from "../../convex/_generated/api";
import { playtimeDay, rewardText, similarReward } from "../../config/playtime";
import { rewardChatPlaytime } from "../../convex/experience";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

const start = Date.UTC(2026, 8, 15, 14);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify(
      Object.fromEntries(
        "admin"
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => [id, "moderator"]),
      ),
    ),
  );
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
  expect(status.remainingSeconds).toBe(1200);
  expect(status.resetsAt).toBe(playtimeDay(start).resetsAt);
  expect(
    await t.run((ctx) => ctx.db.query("experienceLeases").take(10)),
  ).toEqual([]);
});

test("reloads and concurrent tabs reuse one lease; regular accounts stop at twenty minutes", async () => {
  const { t, user } = setup();
  const results = await Promise.all([
    user.mutation(api.experience.acquire, {}),
    user.mutation(api.experience.acquire, {}),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0].remainingSeconds).toBe(1185);
  for (let i = 1; i < 80; i++) {
    vi.setSystemTime(start + i * 15_000);
    await user.mutation(api.experience.acquire, {});
  }
  vi.setSystemTime(start + 1_200_000);
  const exhausted = await user.mutation(api.experience.acquire, {});
  expect(exhausted.remainingSeconds).toBe(0);
  expect(exhausted.leaseUntil).toBe(start + 1_200_000);
  expect(
    await t.run((ctx) => ctx.db.query("experienceLeases").take(10)),
  ).toHaveLength(1);
});

test("staff receive the same twenty minutes, independently of other accounts", async () => {
  vi.stubEnv("NEXT_PUBLIC_CHAT_ADMIN_CLERK_IDS", "impostor");
  const { t, user } = setup("admin");
  const result = await user.mutation(api.experience.acquire, {});
  expect(result.allowanceSeconds).toBe(1200);
  expect(result.remainingSeconds).toBe(1185);
  const other = await t
    .withIdentity({ subject: "impostor", name: "admin" })
    .mutation(api.experience.acquire, {});
  expect(other.remainingSeconds).toBe(1185);
});

test("early renewal never reserves more than fifteen seconds ahead", async () => {
  const { user } = setup();
  await user.mutation(api.experience.acquire, {});
  vi.setSystemTime(start + 10_000);
  const result = await user.mutation(api.experience.acquire, {});
  expect(result.leaseUntil).toBe(start + 25_000);
  expect(result.remainingSeconds).toBe(1175);
});

test("idle time is not charged; only short prepaid intervals are consumed", async () => {
  const { user } = setup();
  await user.mutation(api.experience.acquire, {});
  vi.setSystemTime(start + 3_600_000);
  const result = await user.mutation(api.experience.acquire, {});
  expect(result.remainingSeconds).toBe(1170);
  expect(result.leaseUntil).toBe(start + 3_615_000);
});

test("7:35 Central clips the lease, restores quota, and deletes old limiter and lease records", async () => {
  const { t, user } = setup();
  const midnight = playtimeDay(start).resetsAt;
  vi.setSystemTime(midnight - 2_000);
  const result = await user.mutation(api.experience.acquire, {});
  expect(result.leaseUntil).toBe(midnight);
  expect(result.remainingSeconds).toBe(1198);
  vi.setSystemTime(midnight);
  // Create the next day's state before running delayed cleanup of yesterday.
  const next = await user.mutation(api.experience.acquire, {});
  expect(next.remainingSeconds).toBe(1185);
  await t.finishInProgressScheduledFunctions();
  // Run just yesterday's scheduled cleanup (not tomorrow's).
  await vi.advanceTimersByTimeAsync(2_000);
  await t.finishInProgressScheduledFunctions();
  const rows = await t.run((ctx) => ctx.db.query("experienceLeases").take(10));
  expect(rows).toHaveLength(1);
  expect(rows[0].day).toBe(playtimeDay(midnight).day);
  const old = await t.run((ctx) =>
    ctx.runQuery(components.rateLimiter.lib.getValue, {
      name: "experienceSeconds",
      key: `person:${playtimeDay(start).day}`,
      config: {
        kind: "fixed window",
        rate: 1200,
        period: playtimeDay(start).resetsAt - playtimeDay(start).day,
        start: playtimeDay(start).day,
      },
    }),
  );
  expect(old.ts).toBe(0);
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(1185);
});

test("leaving returns unused seconds and the overview stays frozen", async () => {
  const { user } = setup();
  await user.mutation(api.experience.acquire, { sessionId: "tab" });
  vi.setSystemTime(start + 3_000);
  await user.mutation(api.experience.release, { sessionId: "tab" });
  const stopped = await user.query(api.experience.status, { day: 0 });
  expect(stopped.remainingSeconds).toBe(1197);
  expect(stopped.leaseUntil).toBe(start + 3_000);
  vi.setSystemTime(start + 3_600_000);
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(1197);
  await user.mutation(api.experience.release, { sessionId: "tab" });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(1197);
});

test("closing one tab does not refund time reserved by another active tab", async () => {
  const { user } = setup();
  await user.mutation(api.experience.acquire, { sessionId: "one" });
  await user.mutation(api.experience.acquire, { sessionId: "two" });
  vi.setSystemTime(start + 2_000);
  await user.mutation(api.experience.release, { sessionId: "one" });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(1185);
  vi.setSystemTime(start + 5_000);
  await user.mutation(api.experience.release, { sessionId: "two" });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(1195);
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
  ).toBe(1185);
  vi.setSystemTime(start + 4_000);
  await user.mutation(api.experience.release, { sessionId: "resumed" });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(1196);
});

test("legacy midnight leases do not override the new shared allowance", async () => {
  const { t, user } = setup();
  await t.run((ctx) =>
    ctx.db.insert("experienceLeases", {
      clerkId: "person",
      day: Math.floor(start / 86_400_000),
      until: start + 7_200_000,
      allowanceSeconds: 7200,
    }),
  );
  expect(
    (await user.mutation(api.experience.acquire, {})).remainingSeconds,
  ).toBe(1185);
});

const detailed =
  "Today I finally understood how fractions work because drawing equal pieces helped me compare their sizes.";
const different =
  "Our science project involves growing plants near different windows and recording their height every morning.";

async function exhaust(
  t: ReturnType<typeof setup>["t"],
  user: ReturnType<typeof setup>["user"],
) {
  await user.mutation(api.experience.acquire, { sessionId: "game" });
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("experienceLeases")
      .withIndex("by_clerkId_and_day", (q) =>
        q.eq("clerkId", "person").eq("day", playtimeDay(Date.now()).day),
      )
      .unique();
    await ctx.db.patch(row!._id, { until: Date.now(), sessions: [] });
    // Exact exhausted balance, without simulating 80 network heartbeats.
    await ctx.runMutation(components.rateLimiter.lib.resetRateLimit, {
      name: "experienceSeconds",
      key: `person:${playtimeDay(Date.now()).day}`,
    });
    await ctx.runMutation(components.rateLimiter.lib.rateLimit, {
      name: "experienceSeconds",
      key: `person:${playtimeDay(Date.now()).day}`,
      count: 1200,
      config: {
        kind: "fixed window",
        rate: 1200,
        period: playtimeDay(Date.now()).resetsAt - playtimeDay(Date.now()).day,
        start: playtimeDay(Date.now()).day,
      },
    });
  });
}

test("accepted detailed messages reward exhaustion once, not spam or stockpiling", async () => {
  const { t, user } = setup();
  await t.run((ctx) => rewardChatPlaytime(ctx, "person", detailed));
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(1200);
  await exhaust(t, user);
  await t.run((ctx) => rewardChatPlaytime(ctx, "person", "123456789"));
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(0);
  await t.run((ctx) => rewardChatPlaytime(ctx, "person", detailed));
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(120);
  await t.run((ctx) => rewardChatPlaytime(ctx, "person", different));
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(120);
  await exhaust(t, user);
  await t.run((ctx) =>
    rewardChatPlaytime(ctx, "person", detailed.toUpperCase() + " 42"),
  );
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(0);
  await t.run((ctx) =>
    rewardChatPlaytime(ctx, "person", detailed.replace("Today", "Yesterday")),
  );
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(0);
  await t.run((ctx) => rewardChatPlaytime(ctx, "person", different));
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(120);
});

test("bonus minutes expire at the reset even if yesterday's cleanup is delayed", async () => {
  const { t, user } = setup();
  await exhaust(t, user);
  await t.run((ctx) => rewardChatPlaytime(ctx, "person", detailed));
  vi.setSystemTime(playtimeDay(start).resetsAt);
  const fresh = await user.query(api.experience.status, { day: 0 });
  expect(fresh.remainingSeconds).toBe(1200);
  expect(fresh.allowanceSeconds).toBe(1200);
  await exhaust(t, user);
  await t.run((ctx) => rewardChatPlaytime(ctx, "person", detailed));
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(0);
});

test.each([
  ["2026-09-23T12:34:59Z", "2026-09-22T12:35:00Z", "2026-09-23T12:35:00Z"],
  ["2026-09-23T12:35:00Z", "2026-09-23T12:35:00Z", "2026-09-24T12:35:00Z"],
  ["2026-03-07T14:00:00Z", "2026-03-07T13:35:00Z", "2026-03-08T12:35:00Z"],
  ["2026-10-31T14:00:00Z", "2026-10-31T12:35:00Z", "2026-11-01T13:35:00Z"],
  ["2026-12-31T14:00:00Z", "2026-12-31T13:35:00Z", "2027-01-01T13:35:00Z"],
])("calendar reset for %s", (now, from, to) => {
  expect(playtimeDay(Date.parse(now))).toEqual({
    day: Date.parse(from),
    resetsAt: Date.parse(to),
  });
});

test.each([
  "hi",
  "ok",
  "thanks",
  "Sounds good!",
  "hello there",
  "soooo good",
  "你好",
  "Sí!",
  "Thanks 😊",
  "@someone hi",
  "Check this https://example.com",
])("normal short message qualifies: %s", (body) => {
  expect(rewardText(body)).not.toBeNull();
});

test("reward text still rejects empty, numeric, and obvious spam", () => {
  for (const text of [
    "",
    "   ",
    "123456",
    "😊",
    "https://example.com",
    "@someone",
    "hello ".repeat(20),
    "aaaa",
    "a".repeat(2001),
  ]) {
    expect(rewardText(text)).toBeNull();
  }
  expect(rewardText("HI! 123")).toBe(rewardText("hi"));
  expect(rewardText(detailed)).toBe(
    rewardText(detailed.toUpperCase().replace(" ", "\u200b ") + " 12"),
  );
});

test("short overlapping replies are distinct while long near-copies stay blocked", () => {
  expect(similarReward("hi", "hi")).toBe(true);
  expect(similarReward("how are you doing", "how are you doing today")).toBe(
    false,
  );
  expect(
    similarReward(
      rewardText(detailed)!,
      rewardText(detailed.replace("Today", "Yesterday"))!,
    ),
  ).toBe(true);
});

test("short chat sends grant credit atomically; retries and nonmembers cannot claim it", async () => {
  const { t, user } = setup();
  const room = await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkId: "person",
      username: "person",
      usernameKey: "person",
      clerkCreatedAt: 0,
    });
    await ctx.db.insert("chatSenders", {
      clerkId: "person",
      messagesSent: 100,
      recent: [],
    });
    const conversationId = await ctx.db.insert("conversations", {
      kind: "global",
      createdBy: "person",
      createdAt: 0,
    });
    await ctx.db.insert("conversationMembers", {
      conversationId,
      clerkId: "person",
      kind: "global",
      role: "member",
      status: "active",
      joinedAt: 0,
      lastReadAt: 0,
    });
    return conversationId;
  });
  await exhaust(t, user);
  const args = {
    conversationId: room,
    body: "Sounds good!",
    clientNonce: "reward-message",
  };
  expect(
    await t
      .withIdentity({ subject: "outsider" })
      .mutation(api.chat.messages.send, args),
  ).toMatchObject({ ok: false });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(0);
  expect(await user.mutation(api.chat.messages.send, args)).toEqual({
    ok: true,
  });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(120);
  expect(await user.mutation(api.chat.messages.send, args)).toEqual({
    ok: true,
  });
  expect(
    (await user.query(api.experience.status, { day: 0 })).remainingSeconds,
  ).toBe(120);
  expect(
    await t.run((ctx) => ctx.db.query("playtimeRewards").take(10)),
  ).toHaveLength(1);
});

test("a CEO quota reset restores the shared allowance and discards bonus time", async () => {
  const { t, user } = setup();
  vi.stubEnv("STAFF_ROLES", JSON.stringify({ boss: "ceo" }));
  await t.run((ctx) => ctx.db.insert("users", { clerkId: "person" }));
  await exhaust(t, user);
  await t.run((ctx) => rewardChatPlaytime(ctx, "person", detailed));
  await t.withIdentity({ subject: "boss" }).mutation(api.adminQuotas.reset, {
    clerkId: "person",
    quotas: ["experience"],
  });
  const status = await user.query(api.experience.status, { day: 0 });
  expect(status.remainingSeconds).toBe(1200);
  expect(status.allowanceSeconds).toBe(1200);
});
