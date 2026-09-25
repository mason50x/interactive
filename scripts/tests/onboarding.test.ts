/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");

test("new accounts start unfinished and only their own final action completes them", async () => {
  const t = convexTest(schema, modules);
  const newUser = t.withIdentity({ subject: "new-user" });
  const otherUser = t.withIdentity({ subject: "other-user" });
  await newUser.mutation(api.users.store, {});
  await otherUser.mutation(api.users.store, {});
  expect(await newUser.query(api.users.current, {})).toMatchObject({
    onboardingComplete: false,
  });
  await expect(t.mutation(api.users.completeOnboarding, {})).rejects.toThrow(
    "Not signed in",
  );
  await newUser.mutation(api.users.completeOnboarding, {});
  expect(await newUser.query(api.users.current, {})).toMatchObject({
    onboardingComplete: true,
  });
  expect(await otherUser.query(api.users.current, {})).toMatchObject({
    onboardingComplete: false,
  });
});

test("backfill completes legacy rows without completing new accounts", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { clerkId: "legacy" });
    await ctx.db.insert("users", { clerkId: "new", onboardingComplete: false });
  });
  expect(
    await t.mutation(internal.users.backfillOnboarding, { cursor: null }),
  ).toEqual({ updated: 1, done: true });
  const users = await t.run((ctx) => ctx.db.query("users").collect());
  expect(
    users.find((user) => user.clerkId === "legacy")?.onboardingComplete,
  ).toBe(true);
  expect(users.find((user) => user.clerkId === "new")?.onboardingComplete).toBe(
    false,
  );
});
