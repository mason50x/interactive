/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

test("chat image cleanup keeps published HTML while deleting an orphan upload", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 23));
  const t = setup();
  const { publishedId, orphanId } = await t.run(async ctx => {
    const publishedId = await ctx.storage.store(new Blob(["<p>Keep me</p>"]));
    const orphanId = await ctx.storage.store(new Blob(["orphan"]));
    await ctx.db.insert("publishedHtmlSimulators", {
      label: "Lesson", description: "", storageId: publishedId, contentHash: "a".repeat(64), byteLength: 14,
      revision: 1, createdBy: "builder", updatedBy: "builder", createdAt: Date.now(),
      updatedAt: Date.now(), publishKey: "builder:file-test", lastOperationId: "builder:file-test",
    });
    return { publishedId, orphanId };
  });
  await t.mutation(internal.chat.attachments.sweep, { cutoff: Date.now() + 1 });
  await t.run(async ctx => {
    expect(await ctx.storage.get(publishedId)).not.toBeNull();
    expect(await ctx.storage.get(orphanId)).toBeNull();
  });
});

test("account deletion drains account-owned rows in batches and anonymizes shared publication and actor history", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 23));
  const t = setup();
  await t.run(async ctx => {
    await ctx.db.insert("users", { clerkId: "leaving" });
    await ctx.db.insert("users", { clerkId: "other" });
    for (let i = 0; i < 105; i++) await ctx.db.insert("personalGameViews", {
      clerkId: "leaving", slug: `game-${i}`, views: 1, lastOpenedAt: Date.now(),
    });
    await ctx.db.insert("staffRoles", { clerkId: "leaving", role: "member", updatedAt: Date.now(), updatedBy: "other" });
    await ctx.db.insert("userTimeouts", {
      clerkId: "leaving", reason: "Reason", expiresAt: Date.now() + 1_000,
      enabled: false, issuedBy: "other", issuedByRole: "ceo", updatedAt: Date.now(),
    });
    await ctx.db.insert("timeoutAudit", {
      clerkId: "leaving", actor: "other", action: "on", reason: "Reason", expiresAt: 1, at: Date.now(),
    });
    await ctx.db.insert("timeoutAudit", {
      clerkId: "other", actor: "leaving", action: "off", reason: "Reason", expiresAt: 1, at: Date.now(),
    });
    const storageId = await ctx.storage.store(new Blob(["<p>Shared</p>"]));
    await ctx.db.insert("publishedHtmlSimulators", {
      label: "Shared", description: "", storageId, contentHash: "a".repeat(64), byteLength: 13,
      revision: 1, createdBy: "leaving", updatedBy: "leaving", createdAt: Date.now(),
      updatedAt: Date.now(), publishKey: "leaving:op", lastOperationId: "leaving:op",
    });
  });
  await t.mutation(internal.users.deleteFromClerk, { clerkId: "leaving" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async ctx => {
    expect(await ctx.db.query("personalGameViews").take(1)).toEqual([]);
    expect(await ctx.db.query("staffRoles").take(1)).toEqual([]);
    expect(await ctx.db.query("userTimeouts").take(1)).toEqual([]);
    const history = await ctx.db.query("timeoutAudit").collect();
    expect(history).toHaveLength(1);
    expect(history[0].actor).toBe("deleted-account");
    const published = await ctx.db.query("publishedHtmlSimulators").unique();
    expect(published?.createdBy).toBe("");
    expect(published?.updatedBy).toBe("");
    expect(published?.publishKey).toBe(`deleted:${published?._id}`);
    expect(await ctx.storage.get(published!.storageId)).not.toBeNull();
  });
});

test("dashboard staff can read each user's seven-day timeout log and old records are pruned", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 23));
  vi.stubEnv("STAFF_ROLES", JSON.stringify({ ceo: "ceo", head: "head_moderator" }));
  const t = setup();
  await t.run(async ctx => {
    for (const clerkId of ["ceo", "head", "member"]) await ctx.db.insert("users", { clerkId, username: clerkId });
  });
  const ceo = t.withIdentity({ subject: "ceo" });
  const head = t.withIdentity({ subject: "head" });
  await head.mutation(api.timeouts.set, { clerkId: "member", enabled: true, reason: "Repeated disruption", durationMinutes: 60 });
  await ceo.mutation(api.timeouts.set, { clerkId: "member", enabled: false });
  const historyArgs = { clerkId: "member", paginationOpts: { cursor: null, numItems: 20 } };
  const history = (await head.query(api.timeouts.history, historyArgs)).page;
  expect(history.map(row => [row.action, row.actorLabel, row.reason])).toEqual([
    ["off", "ceo", "Repeated disruption"], ["on", "head", "Repeated disruption"],
  ]);
  await expect(t.withIdentity({ subject: "member" }).query(api.timeouts.history, historyArgs)).rejects.toThrow("access required");
  vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60_000);
  expect((await ceo.query(api.timeouts.history, historyArgs)).page).toEqual([]);
  expect(await t.mutation(internal.dataMaintenance.pruneTimeoutHistory, {})).toBe(2);
  expect(await t.mutation(internal.dataMaintenance.pruneInactiveTimeouts, {})).toBe(1);
});
