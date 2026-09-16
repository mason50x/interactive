/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal, components } from "../../convex/_generated/api";
const modules = import.meta.glob("../../convex/**/*.ts");
const args = {
  activity: "Chess",
  url: "https://example.com",
  reason: "Play with friends",
  details: "",
};
function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("two sends per account, independent accounts, and reset at midnight UTC", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T23:59:00Z"));
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const t = setup();
  const user = t.withIdentity({ subject: "one", name: "Clerk Name" });
  await user.action(api.activityRequests.submit, args);
  await user.action(api.activityRequests.submit, args);
  await expect(user.action(api.activityRequests.submit, args)).rejects.toThrow(
    "two requests",
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[0][1].body).name).toBe("Clerk Name");
  await t
    .withIdentity({ subject: "two" })
    .action(api.activityRequests.submit, args);
  vi.setSystemTime(new Date("2026-09-16T00:00:01Z"));
  await user.action(api.activityRequests.submit, args);
  expect(fetch).toHaveBeenCalledTimes(4);
});

test("auth and validation reject before delivery or consuming quota", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const t = setup();
  await expect(t.action(api.activityRequests.submit, args)).rejects.toThrow(
    "Sign in",
  );
  const user = t.withIdentity({ subject: "one", name: "Clerk Name" });
  await expect(
    user.action(api.activityRequests.submit, {
      ...args,
      url: "javascript:alert(1)",
    }),
  ).rejects.toThrow("valid");
  await expect(
    user.action(api.activityRequests.submit, { ...args, reason: "  " }),
  ).rejects.toThrow("Reason");
  expect(fetch).not.toHaveBeenCalled();
  await user.action(api.activityRequests.submit, { ...args, url: "" });
  await user.action(api.activityRequests.submit, args);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("failed delivery is reported and cannot bypass the daily limit", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("Offline"));
  vi.stubGlobal("fetch", fetch);
  const user = setup().withIdentity({ subject: "one", name: "Clerk Name" });
  for (let i = 0; i < 2; i++)
    await expect(
      user.action(api.activityRequests.submit, args),
    ).rejects.toThrow("couldn't confirm delivery");
  await expect(user.action(api.activityRequests.submit, args)).rejects.toThrow(
    "two requests",
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("expired records are deleted and delayed cleanup preserves today's usage", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T23:59:00Z"));
  const t = setup();
  const user = t.withIdentity({ subject: "cleanup" });
  await user.mutation(internal.activityRequests.reserve, {});
  const state = () =>
    t.query(components.rateLimiter.lib.getValue, {
      name: "activityRequests",
      key: "cleanup",
      config: {
        kind: "fixed window",
        rate: 2,
        capacity: 2,
        period: 86400000,
        start: 0,
      },
    });
  expect((await state()).value).toBe(1);
  await vi.advanceTimersByTimeAsync(60000);
  await t.finishInProgressScheduledFunctions();
  expect((await state()).ts).toBe(0);
  await user.mutation(internal.activityRequests.reserve, {});
  await t.mutation(internal.activityRequests.prune, { key: "cleanup" });
  expect((await state()).value).toBe(1);
  await user.mutation(internal.activityRequests.reserve, {});
  await expect(
    user.mutation(internal.activityRequests.reserve, {}),
  ).rejects.toThrow("two requests");
});
