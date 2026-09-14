import { afterEach, expect, test, vi } from "vitest";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  actor,
  makeConvexTest,
  seedChatPair,
  seedChatProfiles,
  type ConvexHarness,
} from "../helpers/convex";

async function setup() {
  const t = makeConvexTest({ rateLimited: true });
  return { t, ...(await seedChatPair(t)) };
}

async function memberRow(
  t: ConvexHarness,
  conversationId: Id<"conversations">,
  clerkId: string,
) {
  return await t.run((ctx) =>
    ctx.db
      .query("conversationMembers")
      .withIndex("byConversationUser", (q) =>
        q.eq("conversationId", conversationId).eq("clerkId", clerkId),
      )
      .unique(),
  );
}

/** A group made by `owner`, with the id unwrapped. */
async function group(
  owner: ReturnType<typeof actor>,
  title: string,
  joinPolicy: "invite" | "request" | "open",
): Promise<Id<"conversations">> {
  const result = await owner.mutation(api.chat.conversations.createGroup, {
    title,
    joinPolicy,
  });
  if (!result.ok) throw new Error(`createGroup refused: ${result.reason}`);
  return result.conversationId;
}

/** One membership row with a specific state, bypassing the group mutations. */
async function seat(
  t: ConvexHarness,
  conversationId: Id<"conversations">,
  clerkId: string,
  fields: Partial<{
    role: "owner" | "admin" | "member";
    status: "active" | "invited" | "requested" | "banned" | "left";
    joinedAt: number;
  }> = {},
) {
  await t.run((ctx) =>
    ctx.db.insert("conversationMembers", {
      conversationId,
      clerkId,
      kind: "group",
      role: fields.role ?? "member",
      status: fields.status ?? "active",
      joinedAt: fields.joinedAt ?? Date.now(),
      lastReadAt: 0,
    }),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

test("createGroup screens the title and seats the creator as its active owner", async () => {
  const { t, alice } = await setup();

  expect(
    await alice.mutation(api.chat.conversations.createGroup, {
      title: "nigger",
      joinPolicy: "open",
    }),
  ).toEqual({ ok: false, reason: "slur" });
  expect(
    await alice.mutation(api.chat.conversations.createGroup, {
      title: "   ",
      joinPolicy: "open",
    }),
  ).toEqual({ ok: false, reason: "empty" });
  expect(
    await alice.mutation(api.chat.conversations.createGroup, {
      title: "me@example.com",
      joinPolicy: "open",
    }),
  ).toEqual({ ok: false, reason: "contact" });
  expect(
    await actor(t, "nobody").mutation(api.chat.conversations.createGroup, {
      title: "Fine",
      joinPolicy: "open",
    }),
  ).toEqual({ ok: false, reason: "no-profile" });

  const result = await alice.mutation(api.chat.conversations.createGroup, {
    title: "  Chess club ",
    joinPolicy: "request",
  });
  expect(result).toEqual({ ok: true, conversationId: expect.any(String) });
  if (!result.ok) return;

  const conversation = await t.run((ctx) => ctx.db.get(result.conversationId));
  expect(conversation).toMatchObject({
    kind: "group",
    title: "Chess club",
    createdBy: "alice",
    joinPolicy: "request",
  });
  expect(conversation?.lastMessageAt).toBeTypeOf("number");
  expect(await memberRow(t, result.conversationId, "alice")).toMatchObject({
    kind: "group",
    role: "owner",
    status: "active",
  });
  expect(
    await alice.query(api.chat.conversations.get, {
      conversationId: result.conversationId,
    }),
  ).toMatchObject({
    kind: "group",
    title: "Chess club",
    joinPolicy: "request",
    role: "owner",
  });
});

test("openDm is friends only: strangers, unknown ids and the caller are refused", async () => {
  const { t, alice } = await setup();
  await seedChatProfiles(t, ["carol"]);

  expect(
    await alice.mutation(api.chat.conversations.openDm, {
      peerClerkId: "carol",
    }),
  ).toEqual({ ok: false, reason: "not-friends" });
  expect(
    await alice.mutation(api.chat.conversations.openDm, {
      peerClerkId: "nobody",
    }),
  ).toEqual({ ok: false, reason: "unknown" });
  expect(
    await alice.mutation(api.chat.conversations.openDm, {
      peerClerkId: "alice",
    }),
  ).toEqual({ ok: false, reason: "unknown" });
  expect(
    await actor(t, "nobody").mutation(api.chat.conversations.openDm, {
      peerClerkId: "alice",
    }),
  ).toEqual({ ok: false, reason: "no-profile" });

  // A request that is still pending is not a friendship.
  expect(
    await alice.mutation(api.chat.friends.request, { peerClerkId: "carol" }),
  ).toEqual({ ok: true, state: "sent" });
  expect(
    await alice.mutation(api.chat.conversations.openDm, {
      peerClerkId: "carol",
    }),
  ).toEqual({ ok: false, reason: "not-friends" });
});

test("openDm gives friends one thread, the same one from both sides and on repeat", async () => {
  const { t, alice, bob } = await setup();
  await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" });
  await bob.mutation(api.chat.friends.accept, { peerClerkId: "alice" });

  const first = await alice.mutation(api.chat.conversations.openDm, {
    peerClerkId: "bob",
  });
  expect(first).toEqual({ ok: true, conversationId: expect.any(String) });
  if (!first.ok) return;
  expect(
    await alice.mutation(api.chat.conversations.openDm, { peerClerkId: "bob" }),
  ).toEqual(first);
  expect(
    await bob.mutation(api.chat.conversations.openDm, { peerClerkId: "alice" }),
  ).toEqual(first);

  const dms = await t.run((ctx) =>
    ctx.db
      .query("conversations")
      .withIndex("byKind", (q) => q.eq("kind", "dm"))
      .collect(),
  );
  // Alice's bot DM, Bob's bot DM, and the one between them.
  expect(dms).toHaveLength(3);
  expect(await memberRow(t, first.conversationId, "alice")).toMatchObject({
    kind: "dm",
    status: "active",
    dmPeer: "bob",
  });
  expect(await memberRow(t, first.conversationId, "bob")).toMatchObject({
    kind: "dm",
    status: "active",
    dmPeer: "alice",
  });

  // A DM header names the other person.
  expect(
    await alice.query(api.chat.conversations.get, {
      conversationId: first.conversationId,
    }),
  ).toMatchObject({
    kind: "dm",
    role: "member",
    peerClerkId: "bob",
    peerHandle: "bob",
  });
  // Direct messages have no member panel.
  expect(
    await alice.query(api.chat.conversations.members, {
      conversationId: first.conversationId,
    }),
  ).toEqual([]);
});

test("a block in either direction closes the door on openDm", async () => {
  const { t, alice, bob } = await setup();
  await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" });
  await bob.mutation(api.chat.friends.accept, { peerClerkId: "alice" });

  await alice.mutation(api.chat.blocks.block, { peerClerkId: "bob" });
  expect(
    await alice.mutation(api.chat.conversations.openDm, { peerClerkId: "bob" }),
  ).toEqual({ ok: false, reason: "blocked" });
  expect(
    await bob.mutation(api.chat.conversations.openDm, { peerClerkId: "alice" }),
  ).toEqual({ ok: false, reason: "blocked" });

  // Unblocking does not bring the friendship back, so they are strangers again.
  await alice.mutation(api.chat.blocks.unblock, { peerClerkId: "bob" });
  expect(
    await alice.mutation(api.chat.conversations.openDm, { peerClerkId: "bob" }),
  ).toEqual({ ok: false, reason: "not-friends" });
  expect(await t.run((ctx) => ctx.db.query("friendships").take(5))).toEqual(
    [],
  );
});

test("get answers only active members", async () => {
  const { t, alice, bob, global } = await setup();
  const conversationId = await group(alice, "Chess club", "invite");
  await seat(t, conversationId, "bob", { status: "invited" });

  expect(
    await bob.query(api.chat.conversations.get, { conversationId }),
  ).toBeNull();
  expect(
    await actor(t, "nobody").query(api.chat.conversations.get, {
      conversationId,
    }),
  ).toBeNull();
  await bob.mutation(api.chat.groups.respondToInvite, {
    conversationId,
    accept: true,
  });
  expect(
    await bob.query(api.chat.conversations.get, { conversationId }),
  ).toEqual({
    _id: conversationId,
    kind: "group",
    title: "Chess club",
    joinPolicy: "invite",
    role: "member",
    peerClerkId: undefined,
    emoji: undefined,
    initials: undefined,
    hue: undefined,
  });
  expect(
    await bob.query(api.chat.conversations.get, { conversationId: global }),
  ).toMatchObject({ kind: "global", role: "member" });
});

test("members lists a group's seats with role, status and avatar, skipping the departed", async () => {
  const { t, alice, bob } = await setup();
  await seedChatProfiles(t, ["carol", "dave", "erin", "frank"]);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkId: "bob",
      imageUrl: "https://img.example/bob.png",
    });
    const carol = await ctx.db
      .query("chatProfiles")
      .withIndex("byClerkId", (q) => q.eq("clerkId", "carol"))
      .unique();
    await ctx.db.patch(carol!._id, {
      displayName: "Carol C",
      avatarMode: "custom",
      avatarHue: 130,
      avatarEmoji: "🦊",
    });
  });
  const conversationId = await group(alice, "Chess club", "request");
  await seat(t, conversationId, "bob", { role: "admin" });
  await seat(t, conversationId, "carol", { status: "invited" });
  await seat(t, conversationId, "dave", { status: "requested" });
  await seat(t, conversationId, "erin", { status: "left" });
  await seat(t, conversationId, "frank", { status: "banned" });

  const people = await bob.query(api.chat.conversations.members, {
    conversationId,
  });
  expect(people).toEqual([
    {
      clerkId: "alice",
      handle: "alice",
      displayName: undefined,
      avatarUrl: undefined,
      avatarHue: undefined,
      avatarEmoji: undefined,
      avatarInitials: undefined,
      role: "owner",
      status: "active",
    },
    {
      clerkId: "bob",
      handle: "bob",
      displayName: undefined,
      avatarUrl: "https://img.example/bob.png",
      avatarHue: undefined,
      avatarEmoji: undefined,
      avatarInitials: undefined,
      role: "admin",
      status: "active",
    },
    {
      clerkId: "carol",
      handle: "carol",
      displayName: "Carol C",
      avatarUrl: undefined,
      avatarHue: 130,
      avatarEmoji: "🦊",
      avatarInitials: undefined,
      role: "member",
      status: "invited",
    },
    expect.objectContaining({
      clerkId: "dave",
      role: "member",
      status: "requested",
    }),
  ]);

  // Only an active member may look, and being invited is not that.
  expect(
    await actor(t, "carol").query(api.chat.conversations.members, {
      conversationId,
    }),
  ).toEqual([]);
  expect(
    await actor(t, "erin").query(api.chat.conversations.members, {
      conversationId,
    }),
  ).toEqual([]);
});

test("preview shows outsiders an open or request group, and nothing else", async () => {
  const { t, alice, bob } = await setup();
  await seedChatProfiles(t, ["carol", "dave", "erin"]);
  const open = await group(alice, "Open house", "open");
  const asked = await group(alice, "Knock first", "request");
  const closed = await group(alice, "Members only", "invite");
  await seat(t, open, "carol", { status: "invited" });
  await seat(t, open, "dave", { status: "banned" });
  await seat(t, asked, "erin", { status: "requested" });

  expect(
    await bob.query(api.chat.conversations.preview, { conversationId: open }),
  ).toEqual({
    title: "Open house",
    joinPolicy: "open",
    members: 1,
    requested: false,
  });
  // An outstanding invitation still previews; the count is active seats only.
  expect(
    await actor(t, "carol").query(api.chat.conversations.preview, {
      conversationId: open,
    }),
  ).toEqual({
    title: "Open house",
    joinPolicy: "open",
    members: 1,
    requested: false,
  });
  expect(
    await actor(t, "erin").query(api.chat.conversations.preview, {
      conversationId: asked,
    }),
  ).toEqual({
    title: "Knock first",
    joinPolicy: "request",
    members: 1,
    requested: true,
  });

  // The owner is in it, dave was thrown out, the third group is invite-only.
  expect(
    await alice.query(api.chat.conversations.preview, { conversationId: open }),
  ).toBeNull();
  expect(
    await actor(t, "dave").query(api.chat.conversations.preview, {
      conversationId: open,
    }),
  ).toBeNull();
  expect(
    await bob.query(api.chat.conversations.preview, { conversationId: closed }),
  ).toBeNull();
  expect(
    await actor(t, "nobody").query(api.chat.conversations.preview, {
      conversationId: open,
    }),
  ).toBeNull();

  // Joining moves the count and takes the preview away.
  expect(
    await bob.mutation(api.chat.groups.requestJoin, { conversationId: open }),
  ).toEqual({ ok: true });
  expect(
    await actor(t, "carol").query(api.chat.conversations.preview, {
      conversationId: open,
    }),
  ).toMatchObject({ members: 2 });
  expect(
    await bob.query(api.chat.conversations.preview, { conversationId: open }),
  ).toBeNull();
});

test("markRead moves the reading position forward and clears the unread count", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  const { t, alice, bob } = await setup();
  const conversationId = await group(alice, "Chess club", "open");
  await bob.mutation(api.chat.groups.requestJoin, { conversationId });
  const before = (await memberRow(t, conversationId, "bob"))!.lastReadAt;

  vi.setSystemTime(Date.now() + 60_000);
  expect(
    await alice.mutation(api.chat.messages.send, {
      conversationId,
      body: "Anyone up for a game?",
    }),
  ).toEqual({ ok: true });
  const unread = (await bob.query(api.chat.conversations.list, {})).find(
    (row) => row._id === conversationId,
  );
  expect(unread).toMatchObject({ kind: "group", unread: 1, unreadExact: true });

  vi.setSystemTime(Date.now() + 60_000);
  await bob.mutation(api.chat.conversations.markRead, { conversationId });
  const after = (await memberRow(t, conversationId, "bob"))!.lastReadAt;
  expect(after).toBeGreaterThan(before);
  expect(after).toBe(Date.now());
  expect(
    (await bob.query(api.chat.conversations.list, {})).find(
      (row) => row._id === conversationId,
    ),
  ).toMatchObject({ unread: 0 });

  // Somebody who is not an active member has no position to move.
  await seedChatProfiles(t, ["carol"]);
  await seat(t, conversationId, "carol", { status: "invited" });
  vi.setSystemTime(Date.now() + 60_000);
  await actor(t, "carol").mutation(api.chat.conversations.markRead, {
    conversationId,
  });
  expect((await memberRow(t, conversationId, "carol"))!.lastReadAt).toBe(0);
});

test("list orders the room first, then the bot, then by last message, and skips inactive seats", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  const { t, alice, bob } = await setup();
  const older = await group(alice, "Older", "open");
  vi.setSystemTime(Date.now() + 1_000);
  const newer = await group(alice, "Newer", "open");
  const invited = await group(bob, "Not yet", "invite");
  await seat(t, invited, "alice", { status: "invited" });

  const rows = await alice.query(api.chat.conversations.list, {});
  expect(rows.map((row) => [row.kind, row.title ?? row.peerClerkId])).toEqual([
    ["global", undefined],
    ["dm", "bot"],
    ["group", "Newer"],
    ["group", "Older"],
  ]);
  expect(rows[2]).toMatchObject({ role: "owner", unread: 0, mentioned: false });

  // A message in the older group lifts it above the newer one.
  await bob.mutation(api.chat.groups.requestJoin, { conversationId: older });
  vi.setSystemTime(Date.now() + 60_000);
  await bob.mutation(api.chat.messages.send, {
    conversationId: older,
    body: "@everyone hello",
  });
  const moved = await alice.query(api.chat.conversations.list, {});
  expect(moved.map((row) => row.title ?? row.kind)).toEqual([
    "global",
    "dm",
    "Older",
    "Newer",
  ]);
  expect(moved[2]).toMatchObject({ unread: 1, mentioned: true });
  expect(moved.find((row) => row._id === newer)).toMatchObject({ unread: 0 });
});
