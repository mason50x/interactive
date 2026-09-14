import { expect, test } from "vitest";
import { api } from "@convex/_generated/api";
import { actor, makeConvexTest, seedChatProfiles } from "../helpers/convex";

async function setup() {
  const t = makeConvexTest();
  await seedChatProfiles(t, ["alice", "bob", "carol"]);
  const alice = actor(t, "alice");
  const bob = actor(t, "bob");
  const carol = actor(t, "carol");
  return { t, alice, bob, carol };
}

/** The direct-message conversation between two ids, or `null`. */
async function dmBetween(
  t: ReturnType<typeof makeConvexTest>,
  a: string,
  b: string,
) {
  const [userA, userB] = a < b ? [a, b] : [b, a];
  return await t.run((ctx) =>
    ctx.db
      .query("conversations")
      .withIndex("byDmKey", (q) => q.eq("dmKey", `${userA}|${userB}`))
      .unique(),
  );
}

test("request refuses self, strangers, a missing profile and repeats", async () => {
  const { t, alice } = await setup();
  expect(
    await alice.mutation(api.chat.friends.request, { peerClerkId: "alice" }),
  ).toEqual({ ok: false, reason: "self" });
  expect(
    await alice.mutation(api.chat.friends.request, { peerClerkId: "nobody" }),
  ).toEqual({ ok: false, reason: "unknown" });
  expect(
    await actor(t, "ghost").mutation(api.chat.friends.request, {
      peerClerkId: "bob",
    }),
  ).toEqual({ ok: false, reason: "no-profile" });

  expect(
    await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" }),
  ).toEqual({ ok: true, state: "sent" });
  // Pressing again is not a second request.
  expect(
    await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" }),
  ).toEqual({ ok: false, reason: "already" });
  expect(
    await t.run((ctx) => ctx.db.query("friendships").collect()),
  ).toHaveLength(1);
});

test("a request each way completes the friendship and builds the DM", async () => {
  const { t, alice, bob } = await setup();
  await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" });
  expect(await dmBetween(t, "alice", "bob")).toBeNull();

  expect(
    await bob.mutation(api.chat.friends.request, { peerClerkId: "alice" }),
  ).toEqual({ ok: true, state: "accepted" });

  const rows = await t.run((ctx) => ctx.db.query("friendships").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    userA: "alice",
    userB: "bob",
    status: "accepted",
    requestedBy: "alice",
  });
  expect(rows[0].respondedAt).toEqual(expect.any(Number));

  const dm = await dmBetween(t, "alice", "bob");
  expect(dm).toMatchObject({ kind: "dm", dmKey: "alice|bob" });

  // Friends are refused a third row, whichever side asks.
  expect(
    await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" }),
  ).toEqual({ ok: false, reason: "already" });
});

test("only the recipient can accept, and accepting creates one DM with both members", async () => {
  const { t, alice, bob, carol } = await setup();
  await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" });

  // The requester cannot accept their own request; a bystander cannot either.
  await alice.mutation(api.chat.friends.accept, { peerClerkId: "bob" });
  await carol.mutation(api.chat.friends.accept, { peerClerkId: "alice" });
  expect(
    (await t.run((ctx) => ctx.db.query("friendships").unique()))?.status,
  ).toBe("pending");
  expect(await dmBetween(t, "alice", "bob")).toBeNull();

  await bob.mutation(api.chat.friends.accept, { peerClerkId: "alice" });
  expect(
    (await t.run((ctx) => ctx.db.query("friendships").unique()))?.status,
  ).toBe("accepted");

  const dm = await dmBetween(t, "alice", "bob");
  expect(dm).not.toBeNull();
  const members = await t.run((ctx) =>
    ctx.db
      .query("conversationMembers")
      .withIndex("byConversation", (q) => q.eq("conversationId", dm!._id))
      .collect(),
  );
  expect(
    members.map((m) => [m.clerkId, m.status, m.dmPeer]).sort(),
  ).toEqual([
    ["alice", "active", "bob"],
    ["bob", "active", "alice"],
  ]);

  // Accepting again is a no-op: still one conversation, still two rows.
  await bob.mutation(api.chat.friends.accept, { peerClerkId: "alice" });
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("conversations")
        .withIndex("byKind", (q) => q.eq("kind", "dm"))
        .collect(),
    ),
  ).toHaveLength(1);
});

test("a block refuses both request and accept", async () => {
  const { t, alice, bob, carol } = await setup();
  await bob.mutation(api.chat.blocks.block, { peerClerkId: "alice" });
  // Either direction of the block bars it.
  expect(
    await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" }),
  ).toEqual({ ok: false, reason: "blocked" });
  expect(
    await bob.mutation(api.chat.friends.request, { peerClerkId: "alice" }),
  ).toEqual({ ok: false, reason: "blocked" });

  // A pending row that somehow outlives a block cannot be accepted.
  await carol.mutation(api.chat.friends.request, { peerClerkId: "alice" });
  await alice.mutation(api.chat.blocks.block, { peerClerkId: "carol" });
  await t.run(async (ctx) => {
    // `block` deletes the friendship; put the pending row back to prove the
    // acceptance path checks the block on its own.
    await ctx.db.insert("friendships", {
      userA: "alice",
      userB: "carol",
      status: "pending",
      requestedBy: "carol",
      requestedAt: Date.now(),
    });
  });
  await alice.mutation(api.chat.friends.accept, { peerClerkId: "carol" });
  const row = await t.run((ctx) =>
    ctx.db
      .query("friendships")
      .withIndex("byPair", (q) => q.eq("userA", "alice").eq("userB", "carol"))
      .unique(),
  );
  expect(row?.status).toBe("pending");
  expect(await dmBetween(t, "alice", "carol")).toBeNull();
});

test("remove works from either side, keeps the DM, and allows a fresh request", async () => {
  const { t, alice, bob } = await setup();
  await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" });
  await bob.mutation(api.chat.friends.accept, { peerClerkId: "alice" });
  const dm = await dmBetween(t, "alice", "bob");

  // The side that did not ask can end it.
  await bob.mutation(api.chat.friends.remove, { peerClerkId: "alice" });
  expect(await t.run((ctx) => ctx.db.query("friendships").collect())).toEqual(
    [],
  );
  expect(await alice.query(api.chat.friends.list, {})).toEqual([]);
  expect(await bob.query(api.chat.friends.list, {})).toEqual([]);

  // The thread and both memberships stay exactly as they were.
  expect(await t.run((ctx) => ctx.db.get(dm!._id))).not.toBeNull();
  const members = await t.run((ctx) =>
    ctx.db
      .query("conversationMembers")
      .withIndex("byConversation", (q) => q.eq("conversationId", dm!._id))
      .collect(),
  );
  expect(members.map((m) => m.status)).toEqual(["active", "active"]);

  // But a new thread may not be opened until they are friends again.
  expect(
    await alice.mutation(api.chat.conversations.openDm, { peerClerkId: "bob" }),
  ).toEqual({ ok: false, reason: "not-friends" });

  // Removing a pending request from the requester's side is taking it back.
  await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" });
  await alice.mutation(api.chat.friends.remove, { peerClerkId: "bob" });
  expect(await bob.query(api.chat.friends.pending, {})).toEqual([]);
  expect(
    await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" }),
  ).toEqual({ ok: true, state: "sent" });

  // Removing nothing is a no-op.
  await alice.mutation(api.chat.friends.remove, { peerClerkId: "nobody" });
});

test("list is sorted by handle and only shows accepted friends", async () => {
  const { t, alice, bob, carol } = await setup();
  await t.run(async (ctx) => {
    const profile = await ctx.db
      .query("chatProfiles")
      .withIndex("byClerkId", (q) => q.eq("clerkId", "carol"))
      .unique();
    await ctx.db.patch(profile!._id, {
      displayName: "Carol C",
      avatarHue: 40,
      avatarEmoji: "🦊",
    });
  });
  await carol.mutation(api.chat.friends.request, { peerClerkId: "alice" });
  await alice.mutation(api.chat.friends.accept, { peerClerkId: "carol" });
  await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" });
  await bob.mutation(api.chat.friends.accept, { peerClerkId: "alice" });
  // Still pending, so not a friend.
  await bob.mutation(api.chat.friends.request, { peerClerkId: "carol" });

  expect(await alice.query(api.chat.friends.list, {})).toEqual([
    { clerkId: "bob", handle: "bob" },
    {
      clerkId: "carol",
      handle: "carol",
      displayName: "Carol C",
      avatarHue: 40,
      avatarEmoji: "🦊",
    },
  ]);
  expect(
    (await bob.query(api.chat.friends.list, {})).map((f) => f.clerkId),
  ).toEqual(["alice"]);
  // Signed out, or no handle: nothing rather than an error.
  expect(await t.query(api.chat.friends.list, {})).toEqual([]);
  expect(await actor(t, "ghost").query(api.chat.friends.list, {})).toEqual(
    [],
  );
});

test("pending shows both directions, newest first, with outgoing marked", async () => {
  const { t, alice, bob, carol } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("friendships", {
      userA: "alice",
      userB: "bob",
      status: "pending",
      requestedBy: "alice",
      requestedAt: 1_000,
    });
    await ctx.db.insert("friendships", {
      userA: "alice",
      userB: "carol",
      status: "pending",
      requestedBy: "carol",
      requestedAt: 2_000,
    });
  });

  expect(await alice.query(api.chat.friends.pending, {})).toEqual([
    {
      clerkId: "carol",
      handle: "carol",
      outgoing: false,
      requestedAt: 2_000,
    },
    { clerkId: "bob", handle: "bob", outgoing: true, requestedAt: 1_000 },
  ]);
  expect(await bob.query(api.chat.friends.pending, {})).toEqual([
    { clerkId: "alice", handle: "alice", outgoing: false, requestedAt: 1_000 },
  ]);
  expect(await carol.query(api.chat.friends.pending, {})).toEqual([
    { clerkId: "alice", handle: "alice", outgoing: true, requestedAt: 2_000 },
  ]);
  // Accepted rows do not appear here.
  await alice.mutation(api.chat.friends.accept, { peerClerkId: "carol" });
  expect(
    (await alice.query(api.chat.friends.pending, {})).map((r) => r.clerkId),
  ).toEqual(["bob"]);
});
