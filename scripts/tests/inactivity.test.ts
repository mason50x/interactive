/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { addScore } from "../../convex/leaderboard";
import { dmKeyFor } from "../../convex/chat/shared";
import { isCullTime, weekDays } from "../../convex/inactivity";
import { FOUNDER_CLERK_ID } from "../../config/roles";

const modules = import.meta.glob("../../convex/**/*.ts");
const DAY = 86_400_000;
/** Monday 21 September 2026, midday UTC. */
const monday = Date.UTC(2026, 8, 21, 12);
/** That Friday at 2:55 p.m. Central Daylight Time. */
const friday = Date.UTC(2026, 8, 25, 19, 55);
const mod = "user_test_moderator";
const amy = "user_test_amy";
const bo = "user_test_bo";
const gated = "user_test_gated";
const newbie = "user_test_newbie";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(friday);
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify({ [FOUNDER_CLERK_ID]: "ceo", [mod]: "moderator" }),
  );
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_inactivity");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function clerk(status = 200) {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ object: "user", deleted: status === 200 }),
        { status },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const week = weekDays(friday);
  await t.run(async (ctx) => {
    const made = monday - 30 * DAY;
    await ctx.db.insert("users", {
      clerkId: FOUNDER_CLERK_ID,
      username: "mason",
      usernameKey: "mason",
      firstName: "Mason",
      invited: true,
      clerkCreatedAt: made,
    });
    await ctx.db.insert("users", {
      clerkId: mod,
      username: "mod",
      usernameKey: "mod",
      firstName: "Mod",
      invited: true,
      clerkCreatedAt: made,
    });
    await ctx.db.insert("users", {
      clerkId: amy,
      username: "amy",
      usernameKey: "amy",
      firstName: "Amy",
      invited: true,
      clerkCreatedAt: made,
    });
    await ctx.db.insert("users", {
      clerkId: bo,
      username: "bo",
      usernameKey: "bo",
      firstName: "Bo",
      invited: true,
      clerkCreatedAt: made,
    });
    await ctx.db.insert("users", {
      clerkId: gated,
      username: "gated",
      usernameKey: "gated",
      firstName: "Gated",
      invited: false,
      clerkCreatedAt: made,
    });
    await ctx.db.insert("users", {
      clerkId: newbie,
      username: "newbie",
      usernameKey: "newbie",
      firstName: "New",
      invited: true,
      clerkCreatedAt: monday + 3 * DAY,
    });
    // Bo played on Tuesday and chatted on Wednesday; Amy only looked in.
    await addScore(ctx, bo, "playtime", 600, (week[1] + 0.5) * DAY);
    await addScore(ctx, bo, "chat", 2, (week[2] + 0.5) * DAY);
    await ctx.db.insert("userActivity", {
      clerkId: bo,
      currentPath: "/chat",
      lastActiveAt: friday - DAY,
      weekKey: Math.floor((week[0] + 3) / 7),
      weekSeconds: 3_000,
    });
    await ctx.db.insert("userActivity", {
      clerkId: amy,
      currentPath: "/home",
      lastActiveAt: monday,
      weekKey: Math.floor((week[0] + 3) / 7),
      weekSeconds: 40,
    });
  });
  return t;
}

async function masonsBotMessages(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    const dm = await ctx.db
      .query("conversations")
      .withIndex("byDmKey", (q) =>
        q.eq("dmKey", dmKeyFor(FOUNDER_CLERK_ID, "bot")),
      )
      .unique();
    if (dm === null) return [];
    return ctx.db
      .query("messages")
      .withIndex("byConversation", (q) => q.eq("conversationId", dm._id))
      .collect();
  });
}

test("the week's least active member is the one with the least site time, playtime and chat, never staff, the gate or a new account", async () => {
  const t = await setup();
  expect(await t.query(internal.inactivity.pick, {})).toEqual({
    clerkId: amy,
    handle: "amy",
    name: "Amy",
    siteSeconds: 40,
    playtimeSeconds: 0,
    chatMessages: 0,
    score: 40,
    considered: 2,
    windowStart: Date.UTC(2026, 8, 21),
  });

  // Chat is worth playtime at the site's own rate: three messages outrank
  // forty seconds of looking, and Bo's 3,000 seconds outrank both.
  await t.run((ctx) => addScore(ctx, amy, "chat", 3, monday + DAY));
  expect(await t.query(internal.inactivity.pick, {})).toMatchObject({
    clerkId: amy,
    score: 40 + 3 * 90,
  });
  await t.run((ctx) => addScore(ctx, amy, "playtime", 5_000, monday + DAY));
  expect(await t.query(internal.inactivity.pick, {})).toMatchObject({
    clerkId: bo,
    score: 3_000 + 600 + 2 * 90,
  });

  // Last week's time on the site is not this week's.
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("userActivity")
      .withIndex("byClerkId", (q) => q.eq("clerkId", bo))
      .unique();
    await ctx.db.patch(row!._id, { weekKey: row!.weekKey! - 1 });
  });
  expect(await t.query(internal.inactivity.pick, {})).toMatchObject({
    clerkId: bo,
    score: 600 + 2 * 90,
  });
});

test("a tie goes to whoever was seen least recently, then to the older account", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkId: "older",
      invited: true,
      clerkCreatedAt: monday - 40 * DAY,
    });
    await ctx.db.insert("users", {
      clerkId: "newer",
      invited: true,
      clerkCreatedAt: monday - 20 * DAY,
    });
    await ctx.db.insert("users", {
      clerkId: "unseen",
      invited: true,
      clerkCreatedAt: monday - 10 * DAY,
    });
    await ctx.db.insert("userActivity", {
      clerkId: "older",
      currentPath: "/",
      lastActiveAt: monday + DAY,
    });
    await ctx.db.insert("userActivity", {
      clerkId: "newer",
      currentPath: "/",
      lastActiveAt: monday + DAY,
    });
  });
  expect(await t.query(internal.inactivity.pick, {})).toMatchObject({
    clerkId: "unseen",
    name: null,
    handle: null,
    considered: 3,
  });
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", "unseen"))
      .unique();
    await ctx.db.delete(row!._id);
  });
  expect(await t.query(internal.inactivity.pick, {})).toMatchObject({
    clerkId: "older",
    considered: 2,
  });
});

test("the run deletes the account from Clerk, clears it here, and tells Mason from the bot", async () => {
  const fetch = clerk();
  const t = await setup();
  expect(await t.action(internal.inactivity.run, {})).toBe(amy);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe(`https://api.clerk.com/v1/users/${amy}`);
  expect(init.method).toBe("DELETE");
  expect(init.headers.Authorization).toBe("Bearer sk_test_inactivity");

  const users = await t.run((ctx) => ctx.db.query("users").collect());
  expect(users.map((user) => user.clerkId)).not.toContain(amy);
  expect(users).toHaveLength(5);
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("userActivity")
        .withIndex("byClerkId", (q) => q.eq("clerkId", amy))
        .collect(),
    ),
  ).toEqual([]);

  const notes = await masonsBotMessages(t);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({
    authorClerkId: "bot",
    authorName: "ChatGPT",
    status: "visible",
  });
  expect(notes[0].body).toBe(
    "Friday inactivity check: I removed Amy (@amy), this week's least active account. " +
      "Monday to Friday they had under a minute on the site, no time of playtime, and 0 chat messages. " +
      "2 member accounts were considered; staff were skipped.",
  );
  // Mason can read it where every other bot message lands.
  const mason = t.withIdentity({ subject: FOUNDER_CLERK_ID });
  const list = await mason.query(api.chat.conversations.list, {});
  const dm = list.find((conversation) => conversation.peerClerkId === "bot");
  expect(dm).toBeDefined();
  const thread = await mason.query(api.chat.messages.list, {
    conversationId: dm!._id,
    dayStart: 0,
    dayEnd: Number.MAX_SAFE_INTEGER,
    paginationOpts: { numItems: 5, cursor: null },
  });
  expect(thread.page.map((message) => message.body)).toEqual([notes[0].body]);
});

test("Clerk refusing the deletion changes nothing here and is reported to Mason", async () => {
  const fetch = clerk(500);
  const t = await setup();
  await expect(
    t.action(internal.inactivity.run, { force: true }),
  ).rejects.toThrow("Clerk account deletion failed (500)");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(
    (await t.run((ctx) => ctx.db.query("users").collect())).map(
      (user) => user.clerkId,
    ),
  ).toContain(amy);
  const notes = await masonsBotMessages(t);
  expect(notes).toHaveLength(1);
  expect(notes[0].body).toContain("I could not remove Amy (@amy)");
  expect(notes[0].body).toContain("Clerk account deletion failed (500)");
});

test("an account Clerk has already lost is cleared here all the same", async () => {
  clerk(404);
  const t = await setup();
  expect(await t.action(internal.inactivity.run, { force: true })).toBe(amy);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    (await t.run((ctx) => ctx.db.query("users").collect())).map(
      (user) => user.clerkId,
    ),
  ).not.toContain(amy);
});

test("with nobody eligible, nothing is deleted and Mason is told so", async () => {
  const fetch = clerk();
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkId: FOUNDER_CLERK_ID,
      firstName: "Mason",
    });
    await ctx.db.insert("users", { clerkId: mod, firstName: "Mod" });
    await ctx.db.insert("users", {
      clerkId: gated,
      invited: false,
      clerkCreatedAt: monday - DAY,
    });
    await ctx.db.insert("users", {
      clerkId: newbie,
      invited: true,
      clerkCreatedAt: monday + DAY,
    });
  });
  expect(await t.action(internal.inactivity.run, { force: true })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(4);
  const notes = await masonsBotMessages(t);
  expect(notes).toHaveLength(1);
  expect(notes[0].body).toContain("nobody was removed");
});

test("only the booking that lands on 2:55 Central runs, in daylight time and in standard time", async () => {
  // September: Central is UTC-5, so 19:55 UTC is 2:55 and 20:55 is 3:55.
  expect(isCullTime(Date.UTC(2026, 8, 25, 19, 55))).toBe(true);
  expect(isCullTime(Date.UTC(2026, 8, 25, 20, 55))).toBe(false);
  // January: Central is UTC-6, so the hours swap.
  expect(isCullTime(Date.UTC(2027, 0, 8, 19, 55))).toBe(false);
  expect(isCullTime(Date.UTC(2027, 0, 8, 20, 55))).toBe(true);
  // Never on another day, even at the right hour.
  expect(isCullTime(Date.UTC(2026, 8, 24, 19, 55))).toBe(false);

  const fetch = clerk();
  const t = await setup();
  vi.setSystemTime(Date.UTC(2026, 8, 25, 20, 55));
  expect(await t.action(internal.inactivity.run, {})).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(await masonsBotMessages(t)).toEqual([]);
});

test("the heartbeat adds up weekday time on the site from the gaps between beats, and starts over each week", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("users", { clerkId: amy, invited: true }));
  const visitor = t.withIdentity({ subject: amy });
  const row = async () =>
    (await t.run((ctx) =>
      ctx.db
        .query("userActivity")
        .withIndex("byClerkId", (q) => q.eq("clerkId", amy))
        .unique(),
    ))!;

  vi.setSystemTime(monday);
  await visitor.mutation(api.users.heartbeat, { path: "/home" });
  expect(await row()).toMatchObject({ lastActiveAt: monday });
  expect((await row()).weekSeconds).toBeUndefined();

  vi.setSystemTime(monday + 20_000);
  await visitor.mutation(api.users.heartbeat, { path: "/home" });
  vi.setSystemTime(monday + 40_000);
  await visitor.mutation(api.users.heartbeat, { path: "/chat" });
  expect(await row()).toMatchObject({
    weekKey: Math.floor((Math.floor(monday / DAY) + 3) / 7),
    weekSeconds: 40,
  });

  // Ten minutes with the tab hidden is nobody's time.
  vi.setSystemTime(monday + 40_000 + 10 * 60_000);
  await visitor.mutation(api.users.heartbeat, { path: "/chat" });
  expect((await row()).weekSeconds).toBe(40);
  vi.setSystemTime(monday + 40_000 + 10 * 60_000 + 20_000);
  await visitor.mutation(api.users.heartbeat, { path: "/chat" });
  expect((await row()).weekSeconds).toBe(60);

  // Saturday does not count, and keeps the week's total.
  const saturday = monday + 5 * DAY;
  vi.setSystemTime(saturday);
  await visitor.mutation(api.users.heartbeat, { path: "/chat" });
  vi.setSystemTime(saturday + 20_000);
  await visitor.mutation(api.users.heartbeat, { path: "/chat" });
  expect((await row()).weekSeconds).toBe(60);

  // The next Monday starts from nothing.
  const nextMonday = monday + 7 * DAY;
  vi.setSystemTime(nextMonday);
  await visitor.mutation(api.users.heartbeat, { path: "/chat" });
  expect((await row()).weekSeconds).toBe(0);
  vi.setSystemTime(nextMonday + 20_000);
  await visitor.mutation(api.users.heartbeat, { path: "/chat" });
  expect((await row()).weekSeconds).toBe(20);
});
