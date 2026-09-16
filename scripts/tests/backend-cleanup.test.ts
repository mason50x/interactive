/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.useRealTimers());

test("conversation purge drains memberships, typing and presence beyond one batch", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const conversationId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("conversations", {
      kind: "group",
      createdBy: "owner",
      createdAt: 1,
    });
    for (let i = 0; i < 405; i++) {
      const clerkId = `user${i}`;
      await ctx.db.insert("presence", {
        conversationId: id,
        clerkId,
        lastSeenAt: 1,
      });
      await ctx.db.insert("typing", {
        conversationId: id,
        clerkId,
        handle: clerkId,
        until: 1,
      });
      await ctx.db.insert("conversationMembers", {
        conversationId: id,
        clerkId,
        kind: "group",
        role: "member",
        status: "active",
        joinedAt: 1,
        lastReadAt: 0,
      });
    }
    return id;
  });
  expect(
    (
      await t.mutation(internal.chat.sweep.purgeConversation, {
        conversationId,
      })
    ).stage,
  ).toBe("related");
  expect(await t.run((ctx) => ctx.db.get(conversationId))).not.toBeNull();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async (ctx) => {
    expect(await ctx.db.get(conversationId)).toBeNull();
    for (const table of ["presence", "typing", "conversationMembers"] as const)
      expect(await ctx.db.query(table).take(1)).toEqual([]);
  });
  await t.mutation(internal.chat.sweep.purgeConversation, { conversationId });
});
