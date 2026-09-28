/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { PublicAccount } from "../../convex/chat/accounts";
import { accountByHandle, ensureDm, ensureGlobalMembership } from "../../convex/chat/shared";
import { admit } from "./invited";
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
  await admit(t, "account");
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

test("same first names use app casing and keep distinct usernames; any account can open a private DM", async () => {
  const t = convexTest(schema, modules);
  for (const [id, username] of [
    ["one", "alice"],
    ["two", "al1ce"],
  ]) {
    const data = { id, username, first_name: "MASON", updated_at: 1 };
    await t.mutation(internal.users.upsertFromClerk, { data });
    await t.mutation(internal.users.upsertFromClerk, { data });
  }
  await admit(t, "one", "two");
  const one = t.withIdentity({ subject: "one" });
  expect(await one.query(api.chat.accounts.mine, {})).toMatchObject({
    displayName: "Mason",
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
    displayName: "Mason",
  });
  expect(hits[0]).not.toHaveProperty("email");
  await expect(t.action(api.accountSync.mine, {})).rejects.toThrow(
    "Not signed in",
  );
});

test("repeat first names add a last initial, except for Mason Singel (@mason)", async () => {
  const t = convexTest(schema, modules);
  for (const [id, username, last_name] of [
    ["singel", "mason", "Singel"],
    ["d", "masond", "Doe"],
    ["j", "masonj", "jones"],
    ["solo", "greyson", "King"],
  ]) {
    const first_name = id === "solo" ? "Greyson" : "Mason";
    await t.mutation(internal.users.upsertFromClerk, {
      data: { id, username, first_name, last_name, updated_at: 1 },
    });
  }
  await admit(t, "singel", "d", "j", "solo");
  const names = Object.fromEntries(
    (await t.withIdentity({ subject: "solo" }).query(api.chat.accounts.search, { term: "mason" }))
      .map((account: PublicAccount) => [account.handle, account.displayName]),
  );
  expect(names).toEqual({ mason: "Mason", masond: "Mason D", masonj: "Mason J" });
  expect(
    await t.withIdentity({ subject: "solo" }).query(api.chat.accounts.mine, {}),
  ).toMatchObject({ displayName: "Greyson" });
});

test("messages keep their ids and show the current Clerk identity after rename", async () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const account = {
    id: "sender",
    username: "before",
    first_name: "Before",
    image_url: "https://img.clerk.com/test",
    updated_at: 1,
    created_at: 0,
  };
  await t.mutation(internal.users.upsertFromClerk, { data: account });
  await admit(t, "sender");
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
  const scores = await t.run(ctx => ctx.db.query("leaderboardScores")
    .withIndex("by_key_and_clerk", q => q.eq("key", `chat:day:${Math.floor(Date.now() / 86_400_000)}`).eq("clerkId", "sender")).collect());
  expect(scores[0]?.score).toBe(1);
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
  await admit(t, "returning");
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


test("provider names are normalized on onboarding and subsequent Clerk syncs", async () => {
  const t = convexTest(schema, modules);
  const mine = t.withIdentity({ subject: "casing", name: "JANE DOE" });
  await mine.mutation(api.users.store, {});
  expect(await mine.query(api.users.current, {})).toMatchObject({ name: "Jane Doe" });
  for (const updated_at of [1, 2]) {
    await t.mutation(internal.users.upsertFromClerk, {
      data: { id: "casing", username: "JaneDOE", first_name: "  JANE  ", last_name: "DOE", updated_at },
    });
    expect(await mine.query(api.users.current, {})).toMatchObject({
      firstName: "Jane", lastName: "Doe", name: "Jane Doe", username: "JaneDOE",
    });
  }
});

test("an account at the invite gate is refused, unseen, and seated only once it redeems a code", async () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  for (const [id, username] of [["member", "member"], ["new", "newcomer"]]) {
    await t.mutation(internal.users.upsertFromClerk, {
      data: { id, username, first_name: "Same", updated_at: 1 },
    });
  }
  await admit(t, "member");
  const newcomer = t.withIdentity({ subject: "new" });
  const member = t.withIdentity({ subject: "member" });

  expect(await newcomer.query(api.users.current, {})).toMatchObject({ invited: false });
  await expect(newcomer.query(api.chat.conversations.list, {})).rejects.toThrow(
    "Enter an invite code first.",
  );
  await expect(
    newcomer.mutation(api.users.heartbeat, { path: "/chat" }),
  ).rejects.toThrow("Enter an invite code first.");
  expect(
    await t.run((ctx) =>
      ctx.db.query("conversationMembers").filter((q) => q.eq(q.field("clerkId"), "new")).collect(),
    ),
  ).toEqual([]);
  expect(await member.query(api.chat.accounts.search, { term: "newcomer" })).toEqual([]);
  expect(await member.query(api.chat.accounts.mine, {})).toMatchObject({ displayName: "Same" });

  await t.run((ctx) =>
    ctx.db.insert("inviteCodes", { code: "123456", uses: 0, disabled: false, createdBy: "ceo" }),
  );
  expect(await newcomer.mutation(api.invites.redeem, { code: "123456" })).toEqual({ ok: true });
  expect(
    (await newcomer.query(api.chat.conversations.list, {})).map((row) => row.kind),
  ).toContain("global");
  expect(await member.query(api.chat.accounts.search, { term: "newcomer" })).toMatchObject([
    { clerkId: "new" },
  ]);
});

test("clearing gated accounts takes them out of chat and leaves admitted accounts alone", async () => {
  const t = convexTest(schema, modules);
  for (const id of ["member", "gated"]) {
    await t.mutation(internal.users.upsertFromClerk, {
      data: { id, username: id, updated_at: 1 },
    });
  }
  await admit(t, "member");
  // Seated the way sign-up did before the gate was enforced.
  await t.run(async (ctx) => {
    await ensureGlobalMembership(ctx, "gated");
    await ensureDm(ctx, "member", "gated");
    await ctx.db.insert("userActivity", { clerkId: "gated", currentPath: "/chat", lastActiveAt: 1 });
  });
  const seats = (clerkId: string) =>
    t.run((ctx) =>
      ctx.db.query("conversationMembers").withIndex("byUser", (q) => q.eq("clerkId", clerkId)).collect(),
    );
  const memberSeats = (await seats("member")).length;
  expect(await t.mutation(internal.dataMaintenance.clearGatedAccounts, {})).toBeGreaterThan(0);
  expect(await seats("gated")).toEqual([]);
  expect(await seats("member")).toHaveLength(memberSeats - 1);
  expect(await t.run((ctx) => ctx.db.query("userActivity").collect())).toEqual([]);
  expect(await t.mutation(internal.dataMaintenance.clearGatedAccounts, {})).toBe(0);
});
