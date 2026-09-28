/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { FOUNDER_CLERK_ID } from "../../config/roles";

const modules = import.meta.glob("../../convex/**/*.ts");
/** The original CEO: bound to Mason's exact account, not to a role. */
const founder = FOUNDER_CLERK_ID;
const boss = "user_test_ceo";
const mod = "user_test_moderator";
const amy = "user_test_member";

beforeEach(() => {
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify({ [founder]: "ceo", [boss]: "ceo", [mod]: "moderator" }),
  );
});
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const [clerkId, name] of [
      [founder, "Mason"],
      [boss, "Boss"],
      [mod, "Mod"],
      [amy, "Amy"],
    ] as const) {
      await ctx.db.insert("users", { clerkId, name });
    }
  });
  return t;
}

async function roleOf(
  t: ReturnType<typeof convexTest>,
  clerkId: string,
) {
  const users = await t
    .withIdentity({ subject: boss })
    .query(api.adminQuotas.users, { paginationOpts: { cursor: null, numItems: 50 } });
  return users.page.find((user) => user.clerkId === clerkId)?.role;
}

/** The Admin directory row as `viewer` sees it. */
async function directoryRow(
  t: ReturnType<typeof convexTest>,
  viewer: string,
  clerkId: string,
) {
  const users = await t
    .withIdentity({ subject: viewer })
    .query(api.timeouts.users, { paginationOpts: { cursor: null, numItems: 50 } });
  return users.page.find((user) => user.clerkId === clerkId)!;
}

test("a CEO promotes a member and the merged role takes effect everywhere", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: boss });

  expect(await roleOf(t, amy)).toBe("member");
  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: amy,
    role: "moderator",
  });
  expect(await roleOf(t, amy)).toBe("moderator");

  const roles = await ceo.query(api.chat.admin.roles, {});
  expect(roles).toContainEqual({ clerkId: amy, role: "moderator" });
  expect(
    await t.withIdentity({ subject: amy }).query(api.chat.admin.mine, {}),
  ).toBe(true);
});

test("moderators, members, and signed-out callers cannot change roles", async () => {
  const t = await setup();
  for (const subject of [mod, amy, null] as const) {
    const caller = subject === null ? t : t.withIdentity({ subject });
    await expect(
      caller.mutation(api.adminQuotas.setRole, {
        clerkId: amy,
        role: "moderator",
      }),
    ).rejects.toThrow("CEO access required.");
  }
  expect(await roleOf(t, amy)).toBe("member");
});

test("a CEO cannot change their own role", async () => {
  const t = await setup();
  for (const subject of [boss, founder]) {
    await expect(
      t.withIdentity({ subject }).mutation(api.adminQuotas.setRole, {
        clerkId: subject,
        role: "moderator",
      }),
    ).rejects.toThrow("own role");
    expect(
      await t.withIdentity({ subject }).query(api.adminQuotas.access, {}),
    ).toBe(true);
    expect(await directoryRow(t, subject, subject)).toMatchObject({
      canChangeRole: false,
      roleLock: "You cannot change your own role.",
    });
  }
});

test("a CEO cannot change another CEO's role, up or down", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: boss });
  // Promoting to CEO is still any CEO's call.
  await ceo.mutation(api.adminQuotas.setRole, { clerkId: amy, role: "ceo" });
  expect(
    await t.withIdentity({ subject: amy }).query(api.adminQuotas.access, {}),
  ).toBe(true);

  // Neither of the two ordinary CEOs can touch the other, whether the CEO
  // came from the env map or from a table row, and whatever the new role.
  for (const [actor, target] of [
    [boss, amy],
    [amy, boss],
  ] as const) {
    for (const role of ["head_moderator", "member", "ceo"] as const) {
      await expect(
        t.withIdentity({ subject: actor }).mutation(api.adminQuotas.setRole, {
          clerkId: target,
          role,
        }),
      ).rejects.toThrow("Only the founder can change another CEO's role.");
    }
    expect(await roleOf(t, target)).toBe("ceo");
    expect(await directoryRow(t, actor, target)).toMatchObject({
      canChangeRole: false,
      roleLock: "Only the founder can change another CEO's role.",
    });
  }
  // Everybody below CEO is still theirs to change.
  expect(await directoryRow(t, boss, mod)).toMatchObject({
    canChangeRole: true,
  });
  expect(await directoryRow(t, boss, mod)).not.toHaveProperty("roleLock");
});

test("the founder can change any CEO's role and nobody can change the founder's", async () => {
  const t = await setup();
  const mason = t.withIdentity({ subject: founder });
  const ceo = t.withIdentity({ subject: boss });

  await expect(
    ceo.mutation(api.adminQuotas.setRole, { clerkId: founder, role: "member" }),
  ).rejects.toThrow("The founder's role can't be changed.");
  expect(await directoryRow(t, boss, founder)).toMatchObject({
    role: "ceo",
    canChangeRole: false,
    roleLock: "The founder's role can't be changed.",
  });

  expect(await directoryRow(t, founder, boss)).toMatchObject({
    role: "ceo",
    canChangeRole: true,
  });
  await mason.mutation(api.adminQuotas.setRole, {
    clerkId: boss,
    role: "head_moderator",
  });
  expect(
    await t.withIdentity({ subject: boss }).query(api.adminQuotas.access, {}),
  ).toBe(false);
  expect(
    await t.withIdentity({ subject: boss }).query(api.timeouts.access, {}),
  ).toBe("head_moderator");

  // A demoted CEO has no say over the founder either.
  await expect(
    ceo.mutation(api.adminQuotas.setRole, { clerkId: founder, role: "member" }),
  ).rejects.toThrow("CEO access required.");
  expect(await mason.query(api.adminQuotas.access, {})).toBe(true);

  // The founder can hand the role back, too.
  await mason.mutation(api.adminQuotas.setRole, { clerkId: boss, role: "ceo" });
  expect(await roleOf(t, boss)).toBe("ceo");
});

test("demoting one of two CEOs leaves the other in charge", async () => {
  const t = await setup();
  const mason = t.withIdentity({ subject: founder });
  await mason.mutation(api.adminQuotas.setRole, { clerkId: amy, role: "ceo" });
  expect(
    await t.withIdentity({ subject: amy }).query(api.adminQuotas.access, {}),
  ).toBe(true);

  await mason.mutation(api.adminQuotas.setRole, {
    clerkId: amy,
    role: "member",
  });
  expect(await roleOf(t, amy)).toBe("member");
  expect(
    await t.withIdentity({ subject: amy }).query(api.adminQuotas.access, {}),
  ).toBe(false);
  // The acting CEO is untouched by someone else's demotion.
  expect(
    await mason.query(api.adminQuotas.access, {}),
  ).toBe(true);
});

test("a table member row revokes env staff access and unknown users reject", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: boss });
  expect(
    await t.withIdentity({ subject: mod }).query(api.chat.admin.mine, {}),
  ).toBe(true);

  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: mod,
    role: "member",
  });
  expect(await roleOf(t, mod)).toBe("member");
  expect(
    await t.withIdentity({ subject: mod }).query(api.chat.admin.mine, {}),
  ).toBe(false);
  const roles = await ceo.query(api.chat.admin.roles, {});
  expect(roles.some((entry) => entry.clerkId === mod)).toBe(false);

  await expect(
    ceo.mutation(api.adminQuotas.setRole, {
      clerkId: "user_test_ghost",
      role: "moderator",
    }),
  ).rejects.toThrow("User not found.");
});

test("env migration copies staff once and never overwrites CEO edits", async () => {
  const t = await setup();

  expect(await t.mutation(internal.roles.migrateFromEnv, {})).toEqual({
    inserted: 3,
    skipped: 0,
  });
  // Rerun is a no-op.
  expect(await t.mutation(internal.roles.migrateFromEnv, {})).toEqual({
    inserted: 0,
    skipped: 3,
  });

  // A CEO edit after migrating wins over a later migration run.
  const ceo = t.withIdentity({ subject: boss });
  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: mod,
    role: "member",
  });
  expect(await t.mutation(internal.roles.migrateFromEnv, {})).toEqual({
    inserted: 0,
    skipped: 3,
  });
  expect(await roleOf(t, mod)).toBe("member");
  expect(await roleOf(t, boss)).toBe("ceo");
});

test("a CEO hides a staff badge without changing the role's powers", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: boss });

  await ceo.mutation(api.adminQuotas.setBadgeVisible, {
    clerkId: mod,
    visible: false,
  });
  expect(await ceo.query(api.chat.admin.roles, {})).toContainEqual({
    clerkId: mod,
    role: "moderator",
    hideBadge: true,
  });
  expect(await roleOf(t, mod)).toBe("moderator");
  expect(
    await t.withIdentity({ subject: mod }).query(api.chat.admin.mine, {}),
  ).toBe(true);
  const directory = await ceo.query(api.timeouts.users, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  expect(directory.page.find((user) => user.clerkId === mod)?.badgeHidden).toBe(
    true,
  );

  await ceo.mutation(api.adminQuotas.setBadgeVisible, {
    clerkId: mod,
    visible: true,
  });
  expect(await ceo.query(api.chat.admin.roles, {})).toContainEqual({
    clerkId: mod,
    role: "moderator",
  });
});

test("only CEOs can change badge visibility", async () => {
  const t = await setup();
  for (const subject of [mod, amy, null] as const) {
    const caller = subject === null ? t : t.withIdentity({ subject });
    await expect(
      caller.mutation(api.adminQuotas.setBadgeVisible, {
        clerkId: mod,
        visible: false,
      }),
    ).rejects.toThrow("CEO access required.");
  }
});
