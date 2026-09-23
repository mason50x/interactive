import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");
const ceo = "user_live_ceo";
const member = "user_live_member";

beforeEach(() => {
  vi.stubEnv("STAFF_ROLES", JSON.stringify({ [ceo]: "ceo" }));
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("a user's current page replaces the prior snapshot and expires from the live view", async () => {
  const t = convexTest(schema, modules);
  const visitor = t.withIdentity({ subject: member, name: "A Member" });
  const admin = t.withIdentity({ subject: ceo });

  await visitor.mutation(api.users.heartbeat, { path: "/home" });
  expect(
    await admin.query(api.timeouts.liveUsers, { cutoff: Date.now() - 60_000 }),
  ).toMatchObject([{ clerkId: member, currentPath: "/home" }]);

  vi.setSystemTime(Date.now() + 20_000);
  await visitor.mutation(api.users.heartbeat, { path: "/chat" });
  const live = await admin.query(api.timeouts.liveUsers, {
    cutoff: Date.now() - 60_000,
  });
  expect(live).toHaveLength(1);
  expect(live[0].currentPath).toBe("/chat");
  const rows = await t.run((ctx) => ctx.db.query("userActivity").collect());
  expect(rows).toHaveLength(1);

  vi.setSystemTime(Date.now() + 61_000);
  expect(
    await admin.query(api.timeouts.liveUsers, { cutoff: Date.now() - 60_000 }),
  ).toEqual([]);
});

test("only admins can inspect presence, and clients can update only their own valid path", async () => {
  const t = convexTest(schema, modules);
  const visitor = t.withIdentity({ subject: member });
  await visitor.mutation(api.users.heartbeat, { path: "/activities/math" });
  await expect(
    visitor.query(api.timeouts.liveUsers, { cutoff: Date.now() - 60_000 }),
  ).rejects.toThrow("Timeout management access required");
  await expect(
    t.query(api.timeouts.liveUsers, { cutoff: Date.now() - 60_000 }),
  ).rejects.toThrow("Timeout management access required");
  await expect(
    visitor.mutation(api.users.heartbeat, { path: "https://example.com" }),
  ).rejects.toThrow("Invalid page path");
  await expect(
    visitor.mutation(api.users.heartbeat, { path: "//example.com" }),
  ).rejects.toThrow("Invalid page path");
});
