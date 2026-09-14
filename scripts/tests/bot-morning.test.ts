/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const room = await t.run(ctx => ctx.db.insert("conversations", {
    kind: "global", createdBy: "alice", createdAt: 0,
  }));
  return { t, room };
}

test.each([
  ["2026-09-14T12:30:00Z", "2026-09-14"],
  ["2026-01-14T13:30:00Z", "2026-01-14"],
  ["2026-03-08T12:30:00Z", "2026-03-08"],
  ["2026-11-01T13:30:00Z", "2026-11-01"],
  ["2026-09-14T13:30:00Z", null],
  ["2026-01-14T12:30:00Z", null],
  ["2026-09-14T12:29:00Z", null],
])("only generates at 7:30 Central: %s", async (time, expected) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(time));
  const { t } = await setup();
  expect(await t.query(internal.chat.bot.morningGreetingDue, {})).toBe(expected);
});

test("posts once per day as Verity in Everyone, with no fake prompt or reply", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:30:00Z"));
  const { t, room } = await setup();
  const args = { day: "2026-09-14", body: "Morning, breakfast astronauts!" };
  expect(await t.mutation(internal.chat.bot.publishMorningGreeting, args)).toBe(true);
  expect(await t.mutation(internal.chat.bot.publishMorningGreeting, args)).toBe(false);
  expect(await t.query(internal.chat.bot.morningGreetingDue, {})).toBeNull();
  const messages = await t.run(ctx => ctx.db.query("messages").take(10));
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({ conversationId: room, authorClerkId: "bot", authorHandle: "bot", authorName: "Verity", body: args.body, status: "visible" });
  expect(messages[0].replyToId).toBeUndefined();
  vi.setSystemTime(new Date("2026-09-15T12:30:00Z"));
  expect(await t.mutation(internal.chat.bot.publishMorningGreeting, args)).toBe(false);
  expect(await t.query(internal.chat.bot.morningGreetingDue, {})).toBe("2026-09-15");
  expect(await t.mutation(internal.chat.bot.publishMorningGreeting, { ...args, day: "2026-09-15" })).toBe(true);
});

test("off-schedule invocation skips the provider and leaves chat untouched", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T10:00:00Z"));
  const { t } = await setup();
  expect(await t.action(internal.chat.bot.morningGreeting, {})).toBeNull();
  expect(await t.run(ctx => ctx.db.query("messages").take(1))).toEqual([]);
});
