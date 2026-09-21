/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { resolvePrivileges } from "../../convex/roles";
import { botQuotaName } from "../../convex/chat/botConfig";

const modules = import.meta.glob("../../convex/**/*.ts");
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
  ).toBe(7200);
  await expect(
    head.mutation(api.adminQuotas.setRole, { clerkId: "member", role: "ceo" }),
  ).rejects.toThrow("CEO access required");
  await expect(
    head.mutation(api.adminQuotas.reset, { quotas: ["bot"] }),
  ).rejects.toThrow("CEO access required");
  await expect(head.query(api.adminQuotas.users, {})).rejects.toThrow(
    "CEO access required",
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
  // Expiry jobs and an early removal retry cannot undo a CEO's clear.
  await t.finishAllScheduledFunctions(vi.runAllTimers);
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
  "CEO clearance from %s ends at midnight UTC, even before cleanup runs",
  async (source) => {
    const t = await setup();
    const ceo = t.withIdentity({ subject: "ceo" });
    const head = t.withIdentity({ subject: "head" });
    vi.setSystemTime(Date.UTC(2026, 8, 21, 23, 59));
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

    vi.setSystemTime(Date.UTC(2026, 8, 21, 23, 59, 59, 999));
    expect(await user()).toMatchObject({ ceoCleared: true, canManage: false });
    await expect(
      head.mutation(api.timeouts.set, start("member")),
    ).rejects.toThrow("Only a CEO");

    vi.setSystemTime(Date.UTC(2026, 8, 22));
    expect(await user()).toMatchObject({
      timeout: null,
      ceoCleared: false,
      canManage: true,
    });
    await head.mutation(api.timeouts.set, start("member"));
    // A delayed cleanup must preserve the new day's timeout.
    await t.mutation(internal.timeouts.expireCeoClears, {});
    expect(await user()).toMatchObject({
      ceoCleared: false,
      timeout: { reason: "Repeated disruption" },
    });
  },
);

test("daily cleanup expires legacy clears in batches and preserves today's clearance and audit", async () => {
  const t = await setup();
  const now = Date.now();
  const todayId = await t.run(async (ctx) => {
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
        updatedAt: Date.UTC(2026, 8, 20, 23, 59),
      });
    }
    return ctx.db.insert("userTimeouts", {
      ...data,
      clerkId: "member",
      updatedAt: now,
    });
  });
  await t.mutation(internal.timeouts.expireCeoClears, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("userTimeouts").collect();
    expect(rows).toHaveLength(102);
    expect(rows.filter((row) => row.ceoCleared).map((row) => row._id)).toEqual([
      todayId,
    ]);
    expect(rows.every((row) => !row.enabled)).toBe(true);
    expect((await ctx.db.get(todayId))?.updatedAt).toBe(now);
    expect(await ctx.db.query("timeoutAudit").collect()).toEqual([]);
  });
});
