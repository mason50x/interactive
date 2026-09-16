/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { PublicAccount } from "../../convex/chat/accounts";
import { accountByHandle } from "../../convex/chat/shared";
const modules = import.meta.glob("../../convex/**/*.ts");

test("Clerk identity is read from one user row and exposes no private account fields", async () => {
  const t = convexTest(schema, modules);
  const data = {
    id: "account",
    username: "Real-Username",
    first_name: "First",
    last_name: "Private",
    email_addresses: [{ id: "email", email_address: "private@example.com" }],
    image_url: "https://img.clerk.com/example",
    updated_at: 10,
    created_at: 1,
  };
  await t.mutation(internal.users.upsertFromClerk, { data });
  const mine = t.withIdentity({ subject: "account" });
  const first = await mine.query(api.chat.accounts.mine, {});
  expect(first).toMatchObject({
    handle: data.username,
    displayName: "First",
    avatarUrl: data.image_url,
    createdAt: 1,
  });
  expect(first).not.toHaveProperty("email");
  expect(first).not.toHaveProperty("lastName");
  const user = await t.run((ctx) => accountByHandle(ctx, "real-username"));
  await t.mutation(internal.users.upsertFromClerk, {
    data: {
      ...data,
      username: "NewName",
      first_name: "New",
      image_url: "https://img.clerk.com/new",
      updated_at: 20,
    },
  });
  await t.mutation(internal.users.upsertFromClerk, { data });
  await mine.mutation(api.users.store, {});
  expect(await mine.query(api.chat.accounts.mine, {})).toMatchObject({
    handle: "NewName",
    displayName: "New",
    avatarUrl: "https://img.clerk.com/new",
  });
  expect(
    await t.run((ctx) => accountByHandle(ctx, "real-username")),
  ).toBeNull();
  expect(await t.run((ctx) => accountByHandle(ctx, "newname"))).toMatchObject({
    _id: user!._id,
  });
  expect(await t.run((ctx) => ctx.db.query("users").take(10))).toHaveLength(1);
});

test("same first names keep Clerk spelling and distinct usernames; any account can open a private DM", async () => {
  const t = convexTest(schema, modules);
  for (const [id, username] of [
    ["one", "alice"],
    ["two", "al1ce"],
  ]) {
    const data = { id, username, first_name: "MASON", updated_at: 1 };
    await t.mutation(internal.users.upsertFromClerk, { data });
    await t.mutation(internal.users.upsertFromClerk, { data });
  }
  const one = t.withIdentity({ subject: "one" });
  expect(await one.query(api.chat.accounts.mine, {})).toMatchObject({
    displayName: "MASON",
  });
  const dm = await one.mutation(api.chat.conversations.openDm, {
    peerClerkId: "two",
  });
  expect(dm.ok).toBe(true);
  expect(
    await one.mutation(api.chat.conversations.openDm, { peerClerkId: "two" }),
  ).toEqual(dm);
  const hits = await one.query(api.chat.accounts.search, { term: "al1" });
  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({
    clerkId: "two",
    handle: "al1ce",
    displayName: "MASON",
  });
  expect(hits[0]).not.toHaveProperty("email");
  await expect(t.action(api.accountSync.mine, {})).rejects.toThrow(
    "Not signed in",
  );
});

test("messages keep their ids and show the current Clerk identity after rename", async () => {
  const t = convexTest(schema, modules);
  const account = {
    id: "sender",
    username: "before",
    first_name: "Before",
    image_url: "https://img.clerk.com/test",
    updated_at: 1,
    created_at: 0,
  };
  await t.mutation(internal.users.upsertFromClerk, { data: account });
  const room = await t.run(async (ctx) => {
    return (await ctx.db
      .query("conversations")
      .withIndex("byKind", (q) => q.eq("kind", "global"))
      .first())!._id;
  });
  const sender = t.withIdentity({ subject: "sender" });
  const sent = await sender.mutation(api.chat.messages.send, {
    conversationId: room,
    body: "A sunny day for learning.",
  });
  expect(sent.ok).toBe(true);
  const args = {
    conversationId: room,
    dayStart: 0,
    dayEnd: Date.now() + 10000,
    paginationOpts: { cursor: null, numItems: 20 },
  };
  const before = (await sender.query(api.chat.messages.list, args)).page;
  await t.mutation(internal.users.upsertFromClerk, {
    data: { ...account, username: "after", first_name: "After", updated_at: 2 },
  });
  const after = (await sender.query(api.chat.messages.list, args)).page;
  expect(after[0]._id).toBe(before[0]._id);
  expect(after[0]).toMatchObject({
    authorHandle: "after",
    authorName: "After",
    authorAvatarUrl: account.image_url,
    body: "A sunny day for learning.",
  });
});

test("sync automatically rejoins Everyone for an existing account without duplicating membership", async () => {
  const t = convexTest(schema, modules);
  const data = {
    id: "returning",
    username: "returning",
    first_name: "RETURNING",
  };
  await t.mutation(internal.users.upsertFromClerk, { data });
  const memberId = await t.run(async (ctx) => {
    const members = await ctx.db.query("conversationMembers").take(10);
    const member = members.find((row) => row.kind === "global")!;
    await ctx.db.patch(member._id, { status: "left" });
    return member._id;
  });
  await t.mutation(internal.users.upsertFromClerk, { data });
  expect(await t.run((ctx) => ctx.db.get(memberId))).toMatchObject({
    status: "active",
  });
  expect(
    (await t.run((ctx) => ctx.db.query("conversationMembers").take(10))).filter(
      (row) => row.kind === "global",
    ),
  ).toHaveLength(1);
});

test("directory paginates every account without friendship records and DMs remain private", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let i = 0; i < 123; i++)
      await ctx.db.insert("users", {
        clerkId: `u${i}`,
        username: `person${i}`,
        usernameKey: `person${i}`,
        firstName: "Person",
        email: "private@example.com",
        lastName: "Private",
      });
  });
  expect(
    (
      await t.query(api.chat.accounts.directory, {
        paginationOpts: { cursor: null, numItems: 50 },
      })
    ).page,
  ).toEqual([]);
  const caller = t.withIdentity({ subject: "u0" });
  const people = [];
  let cursor: string | null = null;
  for (;;) {
    const page: { page: PublicAccount[]; isDone: boolean; continueCursor: string } = await caller.query(api.chat.accounts.directory, {
      paginationOpts: { cursor, numItems: 50 },
    });
    people.push(...page.page);
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(people).toHaveLength(122);
  expect(new Set(people.map((p) => p.clerkId)).size).toBe(122);
  expect(
    people.every(
      (p) => !("email" in p) && !("lastName" in p) && p.clerkId !== "u0",
    ),
  ).toBe(true);
  const opened = await caller.mutation(api.chat.conversations.openDm, {
    peerClerkId: "u1",
  });
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error("DM failed");
  expect(
    await t
      .withIdentity({ subject: "u1" })
      .query(api.chat.conversations.get, {
        conversationId: opened.conversationId,
      }),
  ).not.toBeNull();
  expect(
    await t
      .withIdentity({ subject: "u2" })
      .query(api.chat.conversations.get, {
        conversationId: opened.conversationId,
      }),
  ).toBeNull();
  expect(
    await caller.mutation(api.chat.conversations.openDm, {
      peerClerkId: "missing",
    }),
  ).toEqual({ ok: false, reason: "unknown" });
});
