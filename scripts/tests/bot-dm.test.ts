/// <reference types="vite/client" />
import { expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
const modules = import.meta.glob("../../convex/**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  for (const name of ["alice", "bob"]) {
    await t.run(ctx => ctx.db.insert("chatProfiles", {
      clerkId: name, handle: name, handleKey: name, createdAt: 0,
      messagesSent: 100,
    }));
    await t.withIdentity({ subject: name }).mutation(api.chat.profiles.joinGlobal, {});
  }
  const alice = t.withIdentity({ subject: "alice" });
  const list = await alice.query(api.chat.conversations.list, {});
  return { t, alice, global: list[0]._id, dm: list[1]._id };
}

test("everyone receives a private pinned bot DM, without duplicates or a bot profile", async () => {
  const { t, alice, dm } = await setup();
  await alice.mutation(api.chat.profiles.joinGlobal, {});
  const list = await alice.query(api.chat.conversations.list, {});
  expect(list).toHaveLength(2);
  expect(list[0].kind).toBe("global");
  expect(list[1]).toMatchObject({ kind: "dm", peerClerkId: "bot", peerName: "Bot", peerAvatarUrl: "/chat/bot-avatar.webp" });
  expect(await alice.query(api.chat.conversations.get, { conversationId: dm })).toMatchObject({ peerName: "Bot" });
  expect(await t.withIdentity({ subject: "bob" }).query(api.chat.conversations.get, { conversationId: dm })).toBeNull();
  expect(await alice.mutation(api.chat.conversations.openDm, { peerClerkId: "bot" })).toEqual({ ok: true, conversationId: dm });
  expect(await t.run(ctx => ctx.db.query("chatProfiles").take(10))).toHaveLength(2);
});

test("plain DMs share the global quota and preserve private context, typing and unread replies", async () => {
  vi.useFakeTimers();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  try {
    const { t, alice, dm, global } = await setup();
    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(Date.now() + 60_000);
      const result = await alice.mutation(api.chat.messages.send, {
        conversationId: i % 2 === 0 ? dm : global,
        body: `${i % 2 === 0 ? "" : "@bot "}What is ${i + 10} plus three?`,
      });
      expect(result.ok).toBe(true);
    }
    const jobs = await t.run(ctx => ctx.db.system.query("_scheduled_functions").take(20));
    const asks = jobs.filter(job => job.name.includes("bot:ask"));
    expect(asks).toHaveLength(6);
    expect(asks.map(job => job.args[0].exhausted)).toEqual([false, false, false, false, false, true]);
    const prompt = await t.run(ctx => ctx.db.query("messages").withIndex("byConversation", q => q.eq("conversationId", dm)).order("desc").first());
    const args = { conversationId: dm, messageId: prompt!._id, askerClerkId: "alice" };
    expect(await t.mutation(internal.chat.bot.beginTyping, args)).toBe(true);
    const context = await t.query(internal.chat.bot.context, args);
    expect(context?.messages).toHaveLength(3);
    expect(context?.messages.every(message => !message.body.includes("@bot"))).toBe(true);
    expect(await t.query(internal.chat.bot.context, { ...args, askerClerkId: "bob" })).toBeNull();
    await alice.mutation(api.chat.conversations.markRead, { conversationId: dm });
    vi.setSystemTime(Date.now() + 1000);
    expect(await t.mutation(internal.chat.bot.finish, { conversationId: dm, messageId: prompt!._id, body: "Seventeen, my friend." })).toBe(true);
    const list = await alice.query(api.chat.conversations.list, {});
    expect(list[1].unread).toBeGreaterThan(0);
    expect(await t.run(ctx => ctx.db.query("typing").take(10))).toEqual([]);
  } finally {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  }
});

test("empty bot DMs get one delayed personalized welcome without generation", async () => {
  vi.useFakeTimers();
  try {
    const { t, alice, dm } = await setup();
    await t.withIdentity({ subject: "bob" }).mutation(api.chat.bot.welcome, { conversationId: dm });
    expect(await t.run(ctx => ctx.db.query("typing").take(10))).toHaveLength(0);
    await alice.mutation(api.chat.bot.welcome, { conversationId: dm });
    await alice.mutation(api.chat.bot.welcome, { conversationId: dm });
    expect(await t.run(ctx => ctx.db.query("typing").take(10))).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("messages").take(10))).toHaveLength(0);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await alice.mutation(api.chat.bot.welcome, { conversationId: dm });
    const messages = await t.run(ctx => ctx.db.query("messages").take(10));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ authorClerkId: "bot", body: expect.stringContaining("Hello, alice!") });
    expect(await t.run(ctx => ctx.db.query("typing").take(10))).toHaveLength(0);
  } finally { vi.useRealTimers(); }
});

test("a message arriving during the welcome delay cancels the welcome", async () => {
  vi.useFakeTimers();
  try {
    const { t, alice, dm } = await setup();
    await alice.mutation(api.chat.bot.welcome, { conversationId: dm });
    await t.run(ctx => ctx.db.insert("messages", {
      conversationId: dm, authorClerkId: "alice", authorHandle: "alice",
      body: "Hello there", status: "visible", flags: [],
    }));
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.run(ctx => ctx.db.query("messages").take(10))).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("typing").take(10))).toHaveLength(0);
  } finally { vi.useRealTimers(); }
});

test("expired typing recovers and obsolete welcome jobs cannot deliver early", async () => {
  vi.useFakeTimers();
  try {
    const { t, alice, dm } = await setup();
    await alice.mutation(api.chat.bot.welcome, { conversationId: dm });
    const oldTyping = (await t.run(ctx => ctx.db.query("typing").take(10)))[0];
    vi.setSystemTime(Date.now() + 9_000);
    await alice.mutation(api.chat.bot.welcome, { conversationId: dm });
    await t.mutation(internal.chat.bot.finishWelcome, { conversationId: dm, typingId: oldTyping._id, name: "alice" });
    expect(await t.run(ctx => ctx.db.query("messages").take(10))).toHaveLength(0);
    expect(await t.run(ctx => ctx.db.query("typing").take(10))).toHaveLength(1);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await t.run(ctx => ctx.db.query("messages").take(10))).toHaveLength(1);
  } finally { vi.useRealTimers(); }
});

test("welcome waits three seconds and can restart after the DM is emptied", async () => {
  vi.useFakeTimers();
  try {
    const { t, alice, dm } = await setup();
    for (let attempt = 0; attempt < 3; attempt++) {
      await alice.mutation(api.chat.bot.welcome, { conversationId: dm });
      await vi.advanceTimersByTimeAsync(2_999);
      await t.finishInProgressScheduledFunctions();
      expect(await t.run(ctx => ctx.db.query("messages").take(10))).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      await t.finishInProgressScheduledFunctions();
      const messages = await t.run(ctx => ctx.db.query("messages").take(10));
      expect(messages).toHaveLength(1);
      await t.run(ctx => ctx.db.delete(messages[0]._id));
    }
  } finally { vi.useRealTimers(); }
});
