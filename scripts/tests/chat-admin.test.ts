/// <reference types="vite/client" />
import { expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
const modules = import.meta.glob("../../convex/**/*.ts");
const mason = "user_3IhbuJdEMX72wHvrpeidDZP1LY5";

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    await ctx.db.insert("users", { clerkId: mason, name: "Renamed" });
    await ctx.db.insert("users", { clerkId: "impostor", name: "Mason Singel", username: "Mason50X" });
    const conversationId = await ctx.db.insert("conversations", { kind: "global", createdBy: "system", createdAt: 1 });
    const memberId = await ctx.db.insert("conversationMembers", { conversationId, clerkId: mason, kind: "global", role: "member", status: "active", joinedAt: 1, lastReadAt: 1 });
    const messageId = await ctx.db.insert("messages", { conversationId, authorClerkId: "other", authorHandle: "other", body: "old message", flags: [], status: "hidden" });
    await ctx.db.insert("mentions", { conversationId, messageId, target: mason, authorClerkId: "other" });
    for (let i = 0; i < 105; i++) await ctx.db.insert("reports", { conversationId, messageId, reporterClerkId: `reporter${i}`, targetClerkId: "other", reason: "spam", createdAt: 1 });
    return { messageId, memberId };
  });
  return { t, ...ids };
}

test("only the verified account receives admin capability, regardless of names", async () => {
  const { t, messageId } = await setup();
  expect(await t.query(api.chat.admin.mine, {})).toBe(false);
  expect(await t.withIdentity({ subject: mason }).query(api.chat.admin.mine, {})).toBe(true);
  const impostor = t.withIdentity({ subject: "impostor", name: "Mason Singel" });
  expect(await impostor.query(api.chat.admin.mine, {})).toBe(false);
  await expect(impostor.mutation(api.chat.admin.remove, { messageId })).rejects.toThrow("Admin access required");
  await expect(t.mutation(api.chat.admin.remove, { messageId })).rejects.toThrow("Admin access required");
  expect(await t.run(ctx => ctx.db.get(messageId))).not.toBeNull();
});

test("admin hard deletes old hidden messages, mentions and batched reports; retries are safe", async () => {
  vi.useFakeTimers();
  try {
    const { t, messageId } = await setup();
    vi.setSystemTime(Date.now() + 86400000);
    const admin = t.withIdentity({ subject: mason });
    await admin.mutation(api.chat.admin.remove, { messageId });
    await admin.mutation(api.chat.admin.remove, { messageId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run(ctx => ctx.db.get(messageId))).toBeNull();
    expect(await t.run(ctx => ctx.db.query("mentions").take(1))).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("reports").take(1))).toEqual([]);
  } finally { vi.useRealTimers(); }
});

test("admin must retain access to the conversation", async () => {
  const { t, messageId, memberId } = await setup();
  await t.run(ctx => ctx.db.patch(memberId, { status: "left" }));
  await expect(t.withIdentity({ subject: mason }).mutation(api.chat.admin.remove, { messageId })).rejects.toThrow("Conversation access required");
  expect(await t.run(ctx => ctx.db.get(messageId))).not.toBeNull();
});

test("verified admin gets 50 bot uses; other accounts get five, with refunds in the same bucket", async () => {
  const { default: rateLimiter } = await import("@convex-dev/rate-limiter/test");
  const { botRateLimiter, botQuotaName } = await import("../../convex/chat/botConfig");
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  vi.useFakeTimers();
  try {
    for (const [clerkId, allowance] of [[mason, 50], ["impostor", 5]] as const) {
      const consume = (count = 1) => t.run(ctx =>
        botRateLimiter.limit(ctx, botQuotaName(clerkId), { key: clerkId, count }),
      );
      for (let i = 0; i < allowance; i++) expect((await consume()).ok).toBe(true);
      expect((await consume()).ok).toBe(false);
      await consume(-1);
      expect((await consume()).ok).toBe(true);
      expect((await consume()).ok).toBe(false);
    }
    vi.advanceTimersByTime(86_400_000);
    expect((await t.run(ctx => botRateLimiter.limit(ctx, botQuotaName(mason), {
      key: mason, count: 50,
    }))).ok).toBe(true);
  } finally { vi.useRealTimers(); }
});
