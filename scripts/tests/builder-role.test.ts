/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { ROLES, adminClerkIds, roleFor } from "../../config/roles";
import { botQuotaName, botRateLimiter } from "../../convex/chat/botConfig";

const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify({
      ceo: "ceo",
      mod: "moderator",
      builder: "builder",
      head: "head_moderator",
    }),
  );
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  for (const id of ["ceo", "mod", "builder", "head", "member"]) {
    await t.mutation(internal.users.upsertFromClerk, {
      data: { id, username: id, updated_at: 1 },
    });
  }
  return t;
}

test("Builder gets moderator allowances and distinct presentation without moderation access", async () => {
  const t = await setup();
  const builder = t.withIdentity({ subject: "builder" });
  expect(roleFor("builder")).toBe("builder");
  expect(ROLES.builder).toEqual({
    ...ROLES.moderator,
    deleteChatMessages: false,
    adminBadge: false,
  });
  expect(adminClerkIds()).not.toContain("builder");
  expect(await builder.query(api.chat.admin.mine, {})).toBe(false);
  expect(await builder.query(api.chat.admin.badges, {})).not.toContain(
    "builder",
  );
  expect(await builder.query(api.chat.admin.roles, {})).toContainEqual({
    clerkId: "builder",
    role: "builder",
  });
  expect(await builder.query(api.adminQuotas.access, {})).toBe(false);
  expect(await builder.query(api.timeouts.access, {})).toBeNull();
  expect(await builder.query(api.experience.status, { day: 0 })).toMatchObject({
    allowanceSeconds: 1800,
    remainingSeconds: 1800,
  });
  await t.run(async (ctx) => {
    const name = await botQuotaName(ctx, "builder");
    expect(name).toBe(await botQuotaName(ctx, "mod"));
    expect(
      (await botRateLimiter.limit(ctx, name, { key: "builder", count: 50 })).ok,
    ).toBe(true);
    expect((await botRateLimiter.limit(ctx, name, { key: "builder" })).ok).toBe(
      false,
    );
  });
  await expect(
    builder.mutation(api.adminQuotas.setRole, {
      clerkId: "member",
      role: "builder",
    }),
  ).rejects.toThrow("CEO access required");
  await expect(
    builder.mutation(api.adminQuotas.reset, {
      clerkId: "builder",
      quotas: ["bot"],
    }),
  ).rejects.toThrow("CEO access required");
  await expect(
    builder.mutation(api.timeouts.set, {
      clerkId: "member",
      enabled: true,
      reason: "Test",
      durationMinutes: 5,
    }),
  ).rejects.toThrow("Timeout management access required");
});

test("Builder can post announcements without message deletion or broadcast access", async () => {
  const t = await setup();
  const builder = t.withIdentity({ subject: "builder" });
  const rooms = await builder.query(api.chat.conversations.list, {});
  const global = rooms.find((room) => room.kind === "global")!;
  const announcements = rooms.find((room) => room.kind === "announcements")!;
  const messageId = await t.run((ctx) =>
    ctx.db.insert("messages", {
      conversationId: global._id,
      authorClerkId: "member",
      authorHandle: "member",
      body: "Hello",
      status: "visible",
      flags: [],
    }),
  );
  await expect(
    builder.mutation(api.chat.admin.remove, { messageId }),
  ).rejects.toThrow("Admin access required");
  expect(await t.run((ctx) => ctx.db.get(messageId))).not.toBeNull();
  expect(
    await builder.mutation(api.chat.messages.send, {
      conversationId: announcements._id,
      body: "Welcome",
    }),
  ).toMatchObject({ ok: true });
  expect(
    await builder.mutation(api.chat.messages.send, {
      conversationId: global._id,
      body: "Hello @everyone",
    }),
  ).toEqual({ ok: false, refusal: "mention-everyone" });
  expect(
    await builder.mutation(api.chat.messages.send, {
      conversationId: global._id,
      body: "Hello friends",
    }),
  ).toMatchObject({ ok: true });
});

test("CEO can assign Builder, revoke existing moderator powers, and demote env Builders", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: "ceo" });
  const room = (await ceo.query(api.chat.conversations.list, {})).find(
    (conversation) => conversation.kind === "announcements",
  )!;
  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: "mod",
    role: "builder",
  });
  expect(
    await t.withIdentity({ subject: "mod" }).query(api.chat.admin.mine, {}),
  ).toBe(false);
  expect(await t.withIdentity({ subject: "mod" }).mutation(api.chat.messages.send, {
    conversationId: room._id,
    body: "Builder announcement",
  })).toMatchObject({ ok: true });
  expect(await ceo.query(api.adminQuotas.users, {})).toContainEqual(
    expect.objectContaining({ clerkId: "mod", role: "builder" }),
  );
  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: "builder",
    role: "member",
  });
  expect(await t.withIdentity({ subject: "builder" }).mutation(api.chat.messages.send, {
    conversationId: room._id,
    body: "No longer staff",
  })).toEqual({ ok: false, refusal: "read-only" });
  expect(
    await t
      .withIdentity({ subject: "builder" })
      .query(api.experience.status, { day: 0 }),
  ).toMatchObject({ allowanceSeconds: 1800 });
  expect(await t.run((ctx) => botQuotaName(ctx, "builder"))).toBe("botTags");
  expect(await ceo.query(api.chat.admin.roles, {})).not.toContainEqual({
    clerkId: "builder",
    role: "builder",
  });
});

test("env migration preserves Builder and head moderators can time out Builders", async () => {
  const t = await setup();
  await t.mutation(internal.roles.migrateFromEnv, {});
  expect(
    await t.withIdentity({ subject: "ceo" }).query(api.adminQuotas.users, {}),
  ).toContainEqual(
    expect.objectContaining({ clerkId: "builder", role: "builder" }),
  );
  await t.withIdentity({ subject: "head" }).mutation(api.timeouts.set, {
    clerkId: "builder",
    enabled: true,
    reason: "Test",
    durationMinutes: 5,
  });
  expect(
    await t.withIdentity({ subject: "builder" }).query(api.timeouts.mine, {}),
  ).not.toBeNull();
});
