/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { resolvePrivileges } from "../../convex/roles";
import { botQuotaName } from "../../convex/chat/botConfig";

const modules = import.meta.glob("../../convex/**/*.ts");
const TWO_HOURS_MS = 7_200_000;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 21, 12));
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify({
      ceo: "ceo",
      head: "head_moderator",
      peer: "head_moderator",
      mod: "moderator",
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  await t.run(async (ctx) => {
    for (const clerkId of ["ceo", "head", "peer", "mod", "member"]) {
      await ctx.db.insert("users", { clerkId, username: clerkId });
    }
  });
  return t;
}
const start = (clerkId: string) => ({
  clerkId,
  enabled: true,
  reason: "Repeated disruption",
  durationMinutes: 60,
});

test("the paginated directory combines profiles, roles, and timeouts with CEO-only contact details", async () => {
  const t = await setup();
  const joinedAt = Date.UTC(2025, 0, 1);
  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", "member"))
      .unique();
    await ctx.db.patch(member!._id, {
      name: "Member Name",
      email: "member@example.com",
      imageUrl: "https://example.com/avatar.png",
      clerkCreatedAt: joinedAt,
    });
  });
  const ceo = t.withIdentity({ subject: "ceo" });
  const head = t.withIdentity({ subject: "head" });
  await head.mutation(api.timeouts.set, start("member"));
  const args = { paginationOpts: { cursor: null, numItems: 50 } };
  const ceoUsers = (await ceo.query(api.timeouts.users, args)).page;
  expect(ceoUsers.find((user) => user.clerkId === "member")).toMatchObject({
    label: "Member Name",
    name: "Member Name",
    email: "member@example.com",
    username: "member",
    imageUrl: "https://example.com/avatar.png",
    joinedAt,
    role: "member",
    canChangeRole: true,
    canManage: true,
    ceoCleared: false,
    timeout: {
      reason: "Repeated disruption",
      expiresAt: Date.now() + 3_600_000,
    },
  });
  const ceoRow = await t.run((ctx) =>
    ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", "ceo"))
      .unique(),
  );
  expect(ceoUsers.find((user) => user.clerkId === "ceo")).toMatchObject({
    role: "ceo",
    joinedAt: ceoRow!._creationTime,
    canChangeRole: false,
    canManage: false,
    timeout: null,
  });
  const headUsers = (await head.query(api.timeouts.users, args)).page;
  expect(headUsers.every((user) => !user.canChangeRole)).toBe(true);
  for (const user of headUsers) {
    expect(user).not.toHaveProperty("name");
    expect(user).not.toHaveProperty("email");
  }
  expect(headUsers.find((user) => user.clerkId === "member")).toMatchObject({
    label: "Member Name",
    role: "member",
    joinedAt,
    canManage: true,
    timeout: { reason: "Repeated disruption" },
  });
  expect(
    headUsers.filter((user) => !user.canManage).map((user) => user.clerkId),
  ).toEqual(["ceo", "head", "peer"]);

  const first = await ceo.query(api.timeouts.users, {
    paginationOpts: { cursor: null, numItems: 2 },
  });
  const second = await ceo.query(api.timeouts.users, {
    paginationOpts: { cursor: first.continueCursor, numItems: 2 },
  });
  const last = await ceo.query(api.timeouts.users, {
    paginationOpts: { cursor: second.continueCursor, numItems: 2 },
  });
  expect(first.isDone).toBe(false);
  expect(last.isDone).toBe(true);
  expect([...first.page, ...second.page, ...last.page]).toEqual(ceoUsers);
});

test("directory roles and controls follow database overrides and revoke a demoted caller", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: "ceo" });
  const head = t.withIdentity({ subject: "head" });
  const args = { paginationOpts: { cursor: null, numItems: 50 } };
  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: "mod",
    role: "member",
  });
  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: "member",
    role: "head_moderator",
  });
  const users = (await head.query(api.timeouts.users, args)).page;
  expect(users.find((user) => user.clerkId === "mod")).toMatchObject({
    role: "member",
    canManage: true,
    canChangeRole: false,
  });
  expect(users.find((user) => user.clerkId === "member")).toMatchObject({
    role: "head_moderator",
    canManage: false,
    canChangeRole: false,
  });
  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: "head",
    role: "member",
  });
  await expect(head.query(api.timeouts.users, args)).rejects.toThrow(
    "access required",
  );
});

test("directory controls preserve CEO-issued restrictions and deny timed-out managers", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: "ceo" });
  const head = t.withIdentity({ subject: "head" });
  const args = { paginationOpts: { cursor: null, numItems: 50 } };
  await ceo.mutation(api.timeouts.set, start("member"));
  expect(
    (await head.query(api.timeouts.users, args)).page.find(
      (user) => user.clerkId === "member",
    ),
  ).toMatchObject({
    role: "member",
    canManage: false,
    canChangeRole: false,
    timeout: { reason: "Repeated disruption" },
  });
  expect(
    (await ceo.query(api.timeouts.users, args)).page.find(
      (user) => user.clerkId === "member",
    ),
  ).toMatchObject({ canManage: true, canChangeRole: true });
  await ceo.mutation(api.timeouts.set, start("head"));
  await expect(head.query(api.timeouts.users, args)).rejects.toThrow(
    "timed out",
  );
});

test("CEO can assign Head Moderator; limits match Moderator but CEO powers stay restricted", async () => {
  const t = await setup();
  await t.withIdentity({ subject: "ceo" }).mutation(api.adminQuotas.setRole, {
    clerkId: "member",
    role: "head_moderator",
  });
  const head = t.withIdentity({ subject: "member" });
  expect(await head.query(api.timeouts.access, {})).toBe("head_moderator");
  expect(await head.query(api.adminQuotas.access, {})).toBe(false);
  await t.run(async (ctx) => {
    expect(await resolvePrivileges(ctx, "member")).toEqual(
      await resolvePrivileges(ctx, "mod"),
    );
    expect(await botQuotaName(ctx, "member")).toBe("adminBotTags");
  });
  expect(
    (await head.query(api.experience.status, { day: 0 })).allowanceSeconds,
  ).toBe(1800);
  await expect(
    head.mutation(api.adminQuotas.setRole, { clerkId: "member", role: "ceo" }),
  ).rejects.toThrow("CEO access required");
  await expect(
    head.mutation(api.adminQuotas.reset, { quotas: ["bot"] }),
  ).rejects.toThrow("CEO access required");
  await expect(head.query(api.adminQuotas.users, { paginationOpts: { cursor: null, numItems: 50 } })).rejects.toThrow(
    "CEO access required",
  );
});

test("Head Moderators cannot promote or demote other users", async () => {
  const t = await setup();
  const head = t.withIdentity({ subject: "head" });
  for (const args of [
    { clerkId: "member", role: "moderator" },
    { clerkId: "mod", role: "member" },
  ] as const) {
    await expect(head.mutation(api.adminQuotas.setRole, args)).rejects.toThrow(
      "CEO access required",
    );
  }
  const users = (
    await head.query(api.timeouts.users, {
      paginationOpts: { cursor: null, numItems: 50 },
    })
  ).page;
  expect(users.find((user) => user.clerkId === "member")).toMatchObject({
    role: "member",
    canChangeRole: false,
  });
  expect(users.find((user) => user.clerkId === "mod")).toMatchObject({
    role: "moderator",
    canChangeRole: false,
  });
  expect(await t.run((ctx) => ctx.db.query("staffRoles").collect())).toEqual(
    [],
  );
});

test("permissions are enforced for direct calls: no self, peers, higher roles, or nonstaff callers", async () => {
  const t = await setup();
  for (const subject of ["mod", "member", null]) {
    const caller = subject ? t.withIdentity({ subject }) : t;
    await expect(
      caller.mutation(api.timeouts.set, start("member")),
    ).rejects.toThrow("access required");
    await expect(
      caller.query(api.timeouts.users, {
        paginationOpts: { cursor: null, numItems: 50 },
      }),
    ).rejects.toThrow("access required");
  }
  const head = t.withIdentity({ subject: "head" });
  for (const clerkId of ["head", "peer", "ceo"]) {
    await expect(
      head.mutation(api.timeouts.set, start(clerkId)),
    ).rejects.toThrow("below your role");
    await expect(
      head.mutation(api.timeouts.set, { clerkId, enabled: false }),
    ).rejects.toThrow("below your role");
  }
  await expect(
    t.withIdentity({ subject: "ceo" }).mutation(api.timeouts.set, start("ceo")),
  ).rejects.toThrow("below your role");
  await expect(
    head.mutation(api.timeouts.set, start("missing")),
  ).rejects.toThrow("User not found");
});

test("Head Moderators can timeout lower roles, but cannot edit or lift CEO restrictions", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: "ceo" });
  const head = t.withIdentity({ subject: "head" });
  await head.mutation(api.timeouts.set, start("mod"));
  expect(
    await t.withIdentity({ subject: "mod" }).query(api.timeouts.mine, {}),
  ).toMatchObject({ reason: "Repeated disruption" });
  await ceo.mutation(api.timeouts.set, start("member"));
  for (const args of [start("member"), { clerkId: "member", enabled: false }]) {
    await expect(head.mutation(api.timeouts.set, args)).rejects.toThrow(
      "Only a CEO",
    );
  }
  await ceo.mutation(api.timeouts.set, start("head"));
  expect(await head.query(api.timeouts.access, {})).toBeNull();
  await expect(head.mutation(api.timeouts.set, start("mod"))).rejects.toThrow(
    "timed out",
  );
  await ceo.mutation(api.timeouts.set, { clerkId: "head", enabled: false });
  expect(await head.query(api.timeouts.access, {})).toBe("head_moderator");
});

test("timeouts expire, support early removal, retain audit, and stale jobs cannot end extensions", async () => {
  const t = await setup();
  const head = t.withIdentity({ subject: "head" });
  const member = t.withIdentity({ subject: "member" });
  await head.mutation(api.timeouts.set, {
    ...start("member"),
    durationMinutes: 1,
  });
  const row = await t.run((ctx) => ctx.db.query("userTimeouts").first());
  vi.setSystemTime(Date.now() + 30_000);
  await head.mutation(api.timeouts.set, start("member"));
  vi.setSystemTime(row!.expiresAt);
  await t.mutation(internal.timeouts.expire, {
    id: row!._id,
    expiresAt: row!.expiresAt,
  });
  expect(await member.query(api.timeouts.mine, {})).not.toBeNull();
  await head.mutation(api.timeouts.set, { clerkId: "member", enabled: false });
  expect(await member.query(api.timeouts.mine, {})).toBeNull();
  await head.mutation(api.timeouts.set, {
    ...start("member"),
    durationMinutes: 1,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await member.query(api.timeouts.mine, {})).toBeNull();
  const audit = await t.run((ctx) => ctx.db.query("timeoutAudit").collect());
  expect(audit.map((row) => row.action)).toEqual(["on", "on", "off", "on"]);
});

test("invalid input rejects and timeouts stop chat and proxy acquisition at the server", async () => {
  const t = await setup();
  const head = t.withIdentity({ subject: "head" });
  for (const durationMinutes of [0, -1, 0.5, 43201, Infinity, NaN]) {
    await expect(
      head.mutation(api.timeouts.set, { ...start("member"), durationMinutes }),
    ).rejects.toThrow("duration");
  }
  for (const reason of [" ", "x".repeat(1001)]) {
    await expect(
      head.mutation(api.timeouts.set, { ...start("member"), reason }),
    ).rejects.toThrow("reason");
  }
  const conversationId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("conversations", {
      kind: "global",
      createdBy: "system",
      createdAt: Date.now(),
    });
    await ctx.db.insert("conversationMembers", {
      conversationId: id,
      clerkId: "member",
      kind: "global",
      role: "member",
      status: "active",
      joinedAt: Date.now(),
      lastReadAt: 0,
    });
    return id;
  });
  await head.mutation(api.timeouts.set, start("member"));
  const member = t.withIdentity({ subject: "member" });
  await expect(member.mutation(api.experience.acquire, {})).rejects.toThrow(
    "timed out",
  );
  expect(
    await member.mutation(api.chat.messages.send, {
      conversationId,
      body: "@bot hello",
    }),
  ).toMatchObject({ ok: false });
  expect(await t.run((ctx) => ctx.db.query("messages").collect())).toEqual([]);
});

test("role changes revoke management immediately and promotion clears old timeouts", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: "ceo" });
  const head = t.withIdentity({ subject: "head" });
  await head.mutation(api.timeouts.set, start("member"));
  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: "member",
    role: "ceo",
  });
  expect(
    await t.withIdentity({ subject: "member" }).query(api.timeouts.mine, {}),
  ).toBeNull();
  await expect(
    head.mutation(api.timeouts.set, start("member")),
  ).rejects.toThrow("below your role");
  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: "head",
    role: "member",
  });
  await expect(head.mutation(api.timeouts.set, start("mod"))).rejects.toThrow(
    "access required",
  );
});

test("the shared list preserves CEO clears against Head Moderator reactivation", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: "ceo" });
  const head = t.withIdentity({ subject: "head" });
  await head.mutation(api.timeouts.set, start("member"));
  const args = { paginationOpts: { cursor: null, numItems: 50 } };
  expect(
    (await ceo.query(api.timeouts.users, args)).page.find(
      (user) => user.clerkId === "member",
    )?.timeout,
  ).not.toBeNull();
  await ceo.mutation(api.timeouts.set, { clerkId: "member", enabled: false });
  expect(
    (await head.query(api.timeouts.users, args)).page.find(
      (user) => user.clerkId === "member",
    ),
  ).toMatchObject({ timeout: null, ceoCleared: true, canManage: false });
  await expect(
    head.mutation(api.timeouts.set, start("member")),
  ).rejects.toThrow("Only a CEO");
  // The original timeout's expiry and an early removal retry cannot undo a clear.
  await vi.advanceTimersByTimeAsync(3_600_000);
  await t.finishInProgressScheduledFunctions();
  await expect(
    head.mutation(api.timeouts.set, start("member")),
  ).rejects.toThrow("Only a CEO");
  await expect(
    head.mutation(api.timeouts.set, { clerkId: "member", enabled: false }),
  ).rejects.toThrow("Only a CEO");
  await ceo.mutation(api.timeouts.set, start("member"));
  expect(
    (await ceo.query(api.timeouts.users, args)).page.find(
      (user) => user.clerkId === "member",
    ),
  ).toMatchObject({ ceoCleared: false, canManage: true });
  await expect(
    head.mutation(api.timeouts.set, { clerkId: "member", enabled: false }),
  ).rejects.toThrow("Only a CEO");
});

test.each(["timeout removal", "role change"])(
  "CEO clearance from %s lasts two hours across midnight, even before cleanup runs",
  async (source) => {
    const t = await setup();
    const ceo = t.withIdentity({ subject: "ceo" });
    const head = t.withIdentity({ subject: "head" });
    const clearedAt = Date.UTC(2026, 8, 21, 23, 59);
    vi.setSystemTime(clearedAt);
    await head.mutation(api.timeouts.set, start("member"));
    if (source === "role change") {
      await ceo.mutation(api.adminQuotas.setRole, {
        clerkId: "member",
        role: "moderator",
      });
    } else {
      await ceo.mutation(api.timeouts.set, {
        clerkId: "member",
        enabled: false,
      });
    }
    const user = async () =>
      (
        await head.query(api.timeouts.users, {
          paginationOpts: { cursor: null, numItems: 50 },
        })
      ).page.find((entry) => entry.clerkId === "member");

    vi.setSystemTime(Date.UTC(2026, 8, 22));
    expect(await user()).toMatchObject({ ceoCleared: true, canManage: false });

    vi.setSystemTime(clearedAt + TWO_HOURS_MS - 1);
    expect(await user()).toMatchObject({ ceoCleared: true, canManage: false });
    await expect(
      head.mutation(api.timeouts.set, start("member")),
    ).rejects.toThrow("Only a CEO");

    vi.setSystemTime(clearedAt + TWO_HOURS_MS);
    expect(await user()).toMatchObject({
      timeout: null,
      ceoCleared: false,
      canManage: true,
    });
    await head.mutation(api.timeouts.set, start("member"));
    // A delayed cleanup must preserve a timeout started after protection ends.
    await t.mutation(internal.timeouts.expireCeoClears, {});
    expect(await user()).toMatchObject({
      ceoCleared: false,
      timeout: { reason: "Repeated disruption" },
    });
  },
);

test.each(["timeout removal", "role change"])(
  "CEO clearance from %s schedules a directory refresh at the two-hour boundary",
  async (source) => {
    const t = await setup();
    const ceo = t.withIdentity({ subject: "ceo" });
    const head = t.withIdentity({ subject: "head" });
    const clearedAt = Date.now();
    await head.mutation(api.timeouts.set, start("member"));
    if (source === "role change") {
      await ceo.mutation(api.adminQuotas.setRole, {
        clerkId: "member",
        role: "moderator",
      });
    } else {
      await ceo.mutation(api.timeouts.set, {
        clerkId: "member",
        enabled: false,
      });
    }
    const row = () => t.run((ctx) => ctx.db.query("userTimeouts").first());
    const audit = await t.run((ctx) => ctx.db.query("timeoutAudit").collect());

    await vi.advanceTimersByTimeAsync(TWO_HOURS_MS - 1);
    await t.finishInProgressScheduledFunctions();
    expect(await row()).toMatchObject({
      enabled: false,
      ceoCleared: true,
      updatedAt: clearedAt,
    });

    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
    expect(await row()).toMatchObject({
      enabled: false,
      ceoCleared: false,
      updatedAt: clearedAt,
    });
    expect(
      await t.run((ctx) => ctx.db.query("timeoutAudit").collect()),
    ).toEqual(audit);
    await head.mutation(api.timeouts.set, start("member"));
  },
);

test("stale clear-expiry jobs preserve refreshed clearances and new CEO timeouts", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: "ceo" });
  const head = t.withIdentity({ subject: "head" });
  const clearedAt = Date.now();
  await head.mutation(api.timeouts.set, start("member"));
  await ceo.mutation(api.timeouts.set, { clerkId: "member", enabled: false });
  const row = await t.run((ctx) => ctx.db.query("userTimeouts").first());
  const originalJob = { id: row!._id, clearedAt };
  // An early invocation cannot shorten the protection window.
  await t.mutation(internal.timeouts.expireCeoClear, originalJob);
  expect(await t.run((ctx) => ctx.db.get(row!._id))).toMatchObject({
    ceoCleared: true,
  });

  await vi.advanceTimersByTimeAsync(3_600_000);
  await t.finishInProgressScheduledFunctions();
  await ceo.mutation(api.timeouts.set, { clerkId: "member", enabled: false });
  const refreshedAt = Date.now();
  await vi.advanceTimersByTimeAsync(3_600_000);
  await t.finishInProgressScheduledFunctions();
  expect(await t.run((ctx) => ctx.db.get(row!._id))).toMatchObject({
    enabled: false,
    ceoCleared: true,
    updatedAt: refreshedAt,
  });
  await expect(
    head.mutation(api.timeouts.set, start("member")),
  ).rejects.toThrow("Only a CEO");

  // A CEO can replace the clear with a new timeout before its scheduled expiry.
  await ceo.mutation(api.timeouts.set, {
    ...start("member"),
    durationMinutes: 180,
  });
  await vi.advanceTimersByTimeAsync(3_600_000);
  await t.finishInProgressScheduledFunctions();
  expect(await t.run((ctx) => ctx.db.get(row!._id))).toMatchObject({
    enabled: true,
    ceoCleared: false,
    issuedByRole: "ceo",
  });
  await expect(
    head.mutation(api.timeouts.set, { clerkId: "member", enabled: false }),
  ).rejects.toThrow("Only a CEO");
});

test("cleanup expires legacy clears in batches at exactly two hours and preserves newer clears and audit", async () => {
  const t = await setup();
  const now = Date.now();
  const recentId = await t.run(async (ctx) => {
    const data = {
      reason: "Already resolved",
      expiresAt: now + 60_000,
      enabled: false,
      ceoCleared: true,
      issuedBy: "head",
      issuedByRole: "head_moderator" as const,
    };
    for (let i = 0; i < 101; i++) {
      await ctx.db.insert("userTimeouts", {
        ...data,
        clerkId: `old-${i}`,
        updatedAt: now - TWO_HOURS_MS,
      });
    }
    return ctx.db.insert("userTimeouts", {
      ...data,
      clerkId: "member",
      updatedAt: now - TWO_HOURS_MS + 1,
    });
  });
  await t.mutation(internal.timeouts.expireCeoClears, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("userTimeouts").collect();
    expect(rows).toHaveLength(102);
    expect(rows.filter((row) => row.ceoCleared).map((row) => row._id)).toEqual([
      recentId,
    ]);
    expect(rows.every((row) => !row.enabled)).toBe(true);
    expect((await ctx.db.get(recentId))?.updatedAt).toBe(
      now - TWO_HOURS_MS + 1,
    );
    expect(await ctx.db.query("timeoutAudit").collect()).toEqual([]);
  });
});
