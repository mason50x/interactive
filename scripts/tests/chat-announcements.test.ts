/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  vi.stubEnv("STAFF_ROLES", JSON.stringify(Object.fromEntries(("admin,secondAdmin").split(",").map(id => id.trim()).filter(Boolean).map(id => [id, "moderator"]))));
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  for (const id of ["admin", "secondAdmin", "reader"]) {
    await t.mutation(internal.users.upsertFromClerk, {
      data: { id, username: id, updated_at: 1 },
    });
  }
  const reader = t.withIdentity({ subject: "reader" });
  const rows = await reader.query(api.chat.conversations.list, {});
  const room = rows.find((row) => row.kind === "announcements")!;
  return { t, reader, room };
}

test("default channel is unique, ordered between Everyone and Verity, and rejoined", async () => {
  const { t, reader, room } = await setup();
  expect(
    (await reader.query(api.chat.conversations.list, {}))
      .slice(0, 3)
      .map((row) => row.kind),
  ).toEqual(["global", "announcements", "dm"]);
  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("conversationMembers")
      .withIndex("byConversationUser", (q) =>
        q.eq("conversationId", room._id).eq("clerkId", "reader"),
      )
      .unique();
    await ctx.db.patch(member!._id, { status: "left" });
  });
  await t.mutation(internal.users.upsertFromClerk, {
    data: { id: "reader", username: "reader", updated_at: 2 },
  });
  expect(
    (await reader.query(api.chat.conversations.list, {})).filter(
      (row) => row.kind === "announcements",
    ),
  ).toHaveLength(1);
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("conversations")
        .withIndex("byKind", (q) => q.eq("kind", "announcements"))
        .take(2),
    ),
  ).toHaveLength(1);
});

test("only site admins can send; group roles and names cannot grant posting; revocation applies immediately", async () => {
  const { t, reader, room } = await setup();
  const args = { conversationId: room._id, body: "Welcome to the community" };
  expect(await reader.mutation(api.chat.messages.send, args)).toEqual({
    ok: false,
    refusal: "read-only",
  });
  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("conversationMembers")
      .withIndex("byConversationUser", (q) =>
        q.eq("conversationId", room._id).eq("clerkId", "reader"),
      )
      .unique();
    await ctx.db.patch(member!._id, { role: "admin" });
  });
  expect(await reader.mutation(api.chat.messages.send, args)).toEqual({
    ok: false,
    refusal: "read-only",
  });
  for (const subject of ["admin", "secondAdmin"]) {
    expect(
      await t.withIdentity({ subject }).mutation(api.chat.messages.send, args),
    ).toMatchObject({ ok: true });
  }
  vi.stubEnv("STAFF_ROLES", JSON.stringify(Object.fromEntries(("").split(",").map(id => id.trim()).filter(Boolean).map(id => [id, "moderator"]))));
  expect(
    await t
      .withIdentity({ subject: "admin" })
      .mutation(api.chat.messages.send, args),
  ).toEqual({ ok: false, refusal: "read-only" });
  expect(await t.mutation(api.chat.messages.send, args)).toEqual({
    ok: false,
    refusal: "not-a-member",
  });
});

test("readers can paginate a day and mark it read, but cannot react or type", async () => {
  const { t, reader, room } = await setup();
  const ids = await t.run(async (ctx) => {
    const ids = [];
    for (let i = 0; i < 4; i++)
      ids.push(
        await ctx.db.insert("messages", {
          conversationId: room._id,
          authorClerkId: "admin",
          authorHandle: "admin",
          body: `Announcement ${i}`,
          status: "visible",
          flags: [],
        }),
      );
    return ids;
  });
  const cutoff = (await t.run((ctx) => ctx.db.get(ids[1])))!._creationTime;
  const args = {
    conversationId: room._id,
    dayStart: cutoff,
    dayEnd: Date.now() + 86400000,
  };
  const first = await reader.query(api.chat.messages.list, {
    ...args,
    paginationOpts: { numItems: 2, cursor: null },
  });
  const second = await reader.query(api.chat.messages.list, {
    ...args,
    paginationOpts: { numItems: 2, cursor: first.continueCursor },
  });
  expect([...first.page, ...second.page].map((row) => row._id)).toEqual([
    ids[3],
    ids[2],
    ids[1],
  ]);
  await reader.mutation(api.chat.messages.react, {
    messageId: ids[3],
    emoji: "👍",
  });
  await reader.mutation(api.chat.typing.start, { conversationId: room._id });
  expect((await t.run((ctx) => ctx.db.get(ids[3])))?.reactions ?? []).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("typing").take(1))).toEqual([]);
  await reader.mutation(api.chat.conversations.markRead, {
    conversationId: room._id,
  });
  expect(
    (await reader.query(api.chat.conversations.list, {})).find(
      (row) => row._id === room._id,
    )?.unread,
  ).toBe(0);
});
