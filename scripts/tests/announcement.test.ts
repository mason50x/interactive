/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { ANNOUNCEMENT_ERROR } from "../../convex/announcementState";

const modules = import.meta.glob("../../convex/**/*.ts");
const REFUSED = "CEO or Head Moderator access required.";

beforeEach(() => {
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify({ ceo: "ceo", head: "head_moderator", mod: "moderator" }),
  );
});
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const clerkId of ["ceo", "head", "mod", "member"]) {
      await ctx.db.insert("users", { clerkId, username: clerkId });
    }
  });
  return t;
}
const as = (t: ReturnType<typeof convexTest>, who: string) =>
  t.withIdentity({ subject: who });

test("a head moderator writes the announcement and takes it live", async () => {
  const t = await setup();
  await as(t, "head").mutation(api.announcement.save, {
    heading: "  Maintenance  ",
    message: "Back soon.",
    display: "screen",
    enabled: true,
  });
  expect(await as(t, "member").query(api.announcement.mine, {})).toMatchObject({
    heading: "Maintenance",
    message: "Back soon.",
    display: "screen",
    manages: false,
  });
  expect((await as(t, "head").query(api.announcement.mine, {}))?.manages).toBe(
    true,
  );
  expect((await as(t, "ceo").query(api.announcement.mine, {}))?.manages).toBe(
    true,
  );
  const current = await as(t, "ceo").query(api.announcement.get, {});
  expect(current).toMatchObject({
    enabled: true,
    heading: "Maintenance",
    updatedBy: "@head",
    enabledBy: "@head",
  });
  expect(current.enabledAt).toBe(current.updatedAt);
});

test("moderators and members can neither read nor write it", async () => {
  const t = await setup();
  for (const who of ["mod", "member"]) {
    await expect(
      as(t, who).mutation(api.announcement.save, {
        heading: "x",
        display: "banner",
      }),
    ).rejects.toThrow(REFUSED);
    await expect(as(t, who).query(api.announcement.get, {})).rejects.toThrow(
      REFUSED,
    );
    await expect(
      as(t, who).mutation(api.announcement.turnOff, {}),
    ).rejects.toThrow(REFUSED);
  }
  await expect(
    t.mutation(api.announcement.save, { heading: "x", display: "banner" }),
  ).rejects.toThrow(REFUSED);
});

test("it needs a heading to go live, but the empty draft saves while off", async () => {
  const t = await setup();
  await as(t, "ceo").mutation(api.announcement.save, {
    heading: "",
    message: "Just a draft.",
    display: "screen",
  });
  expect(await as(t, "member").query(api.announcement.mine, {})).toBeNull();
  await expect(
    as(t, "ceo").mutation(api.announcement.save, {
      heading: "   ",
      display: "screen",
      enabled: true,
    }),
  ).rejects.toThrow("Give the announcement a heading before it goes live.");
  await expect(
    as(t, "ceo").mutation(api.announcement.save, {
      heading: "x".repeat(121),
      display: "screen",
    }),
  ).rejects.toThrow("at most 120 characters");
});

test("a full-screen announcement locks members out of every guarded function, never managers", async () => {
  const t = await setup();
  await as(t, "ceo").mutation(api.announcement.save, {
    heading: "Down for a bit",
    display: "screen",
    enabled: true,
  });
  await expect(as(t, "member").query(api.timeouts.access, {})).rejects.toThrow(
    ANNOUNCEMENT_ERROR,
  );
  await expect(as(t, "mod").query(api.timeouts.access, {})).rejects.toThrow(
    ANNOUNCEMENT_ERROR,
  );
  expect(await as(t, "head").query(api.timeouts.access, {})).toBe(
    "head_moderator",
  );
  expect(await as(t, "ceo").query(api.timeouts.access, {})).toBe("ceo");
  // The one function that has to answer a locked-out member still does.
  expect(await as(t, "member").query(api.announcement.mine, {})).toMatchObject({
    heading: "Down for a bit",
  });

  // One click from the card a head moderator sees lets everyone back in.
  await as(t, "head").mutation(api.announcement.turnOff, {});
  expect(await as(t, "member").query(api.timeouts.access, {})).toBeNull();
  expect(await as(t, "member").query(api.announcement.mine, {})).toBeNull();
  // The words stay for next time.
  expect(await as(t, "head").query(api.announcement.get, {})).toMatchObject({
    enabled: false,
    heading: "Down for a bit",
    updatedBy: "@head",
  });
});

test("a card announcement is shown to everyone and locks nobody out", async () => {
  const t = await setup();
  await as(t, "head").mutation(api.announcement.save, {
    heading: "Something new",
    display: "banner",
    enabled: true,
  });
  expect(await as(t, "member").query(api.timeouts.access, {})).toBeNull();
  expect(await as(t, "member").query(api.announcement.mine, {})).toMatchObject({
    heading: "Something new",
    display: "banner",
    manages: false,
  });
  expect(await as(t, "head").query(api.announcement.mine, {})).toMatchObject({
    display: "banner",
    manages: true,
  });
});

test("saving the words keeps whether it is live", async () => {
  const t = await setup();
  await as(t, "ceo").mutation(api.announcement.save, {
    heading: "First",
    display: "screen",
    enabled: true,
  });
  const before = await as(t, "ceo").query(api.announcement.get, {});
  await as(t, "head").mutation(api.announcement.save, {
    heading: "Second",
    display: "screen",
  });
  const after = await as(t, "ceo").query(api.announcement.get, {});
  expect(after).toMatchObject({ enabled: true, heading: "Second" });
  // Who turned it on is not rewritten by an edit.
  expect(after.enabledBy).toBe("@ceo");
  expect(after.enabledAt).toBe(before.enabledAt);
  expect(await as(t, "member").query(api.announcement.mine, {})).toMatchObject({
    heading: "Second",
  });
});

test("a timed-out head moderator can't take the site down", async () => {
  const t = await setup();
  await t.run((ctx) =>
    ctx.db.insert("userTimeouts", {
      clerkId: "head",
      reason: "test",
      expiresAt: Date.now() + 60_000,
      updatedAt: Date.now(),
      enabled: true,
      issuedBy: "ceo",
      issuedByRole: "ceo",
    }),
  );
  await expect(
    as(t, "head").mutation(api.announcement.save, {
      heading: "x",
      display: "screen",
      enabled: true,
    }),
  ).rejects.toThrow("timed out");
});
