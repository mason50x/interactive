import { afterEach, expect, test, vi } from "vitest";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { MAX_MEMBERS } from "@convex/moderation/limits";
import {
  actor,
  makeConvexTest,
  seedChatPair,
  seedChatProfiles,
  type ConvexActor,
  type ConvexHarness,
} from "../helpers/convex";

type Status = "active" | "invited" | "requested" | "banned" | "left";
type Role = "owner" | "admin" | "member";

/**
 * Alice owns a group, Bob is its admin and Carol an ordinary member; Dave and
 * Erin have profiles and no seat. Bob and Carol are seated directly rather
 * than through the mutations, so a test about one path is not also a test of
 * the others.
 */
async function setup(joinPolicy: "invite" | "request" | "open" = "invite") {
  const t = makeConvexTest({ rateLimited: true });
  const pair = await seedChatPair(t);
  await seedChatProfiles(t, ["carol", "dave", "erin"]);
  const created = await pair.alice.mutation(
    api.chat.conversations.createGroup,
    { title: "Chess club", joinPolicy },
  );
  if (!created.ok) throw new Error(`createGroup refused: ${created.reason}`);
  const groupId = created.conversationId;
  await seat(t, groupId, "bob", { role: "admin", joinedAt: 1_000 });
  await seat(t, groupId, "carol", { joinedAt: 2_000 });
  return {
    t,
    groupId,
    alice: pair.alice,
    bob: pair.bob,
    carol: actor(t, "carol"),
    dave: actor(t, "dave"),
    erin: actor(t, "erin"),
  };
}

async function seat(
  t: ConvexHarness,
  conversationId: Id<"conversations">,
  clerkId: string,
  fields: Partial<{ role: Role; status: Status; joinedAt: number }> = {},
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

/** `[status, role]` of one seat, or `null` when the row is gone. */
async function standing(
  t: ConvexHarness,
  conversationId: Id<"conversations">,
  clerkId: string,
) {
  const row = await memberRow(t, conversationId, clerkId);
  return row === null ? null : [row.status, row.role];
}

/** Seats until the group is at `MAX_MEMBERS`, counting the way `memberCount` does. */
async function fill(t: ConvexHarness, conversationId: Id<"conversations">) {
  const existing = await t.run((ctx) =>
    ctx.db
      .query("conversationMembers")
      .withIndex("byConversation", (q) => q.eq("conversationId", conversationId))
      .collect(),
  );
  const counted = existing.filter(
    (row) => row.status === "active" || row.status === "invited",
  ).length;
  for (let index = counted; index < MAX_MEMBERS; index++) {
    await seat(t, conversationId, `filler-${index}`, {
      status: index % 2 === 0 ? "active" : "invited",
    });
  }
}

const invite = (who: ConvexActor, groupId: Id<"conversations">, peer: string) =>
  who.mutation(api.chat.groups.invite, {
    conversationId: groupId,
    peerClerkId: peer,
  });

afterEach(() => {
  vi.useRealTimers();
});

test("invite is for owners and admins, and every refusal has its reason", async () => {
  const { t, groupId, alice, bob, carol, dave } = await setup();

  expect(await invite(carol, groupId, "dave")).toEqual({
    ok: false,
    reason: "not-allowed",
  });
  expect(await invite(dave, groupId, "erin")).toEqual({
    ok: false,
    reason: "not-allowed",
  });
  expect(
    await actor(t, "nobody").mutation(api.chat.groups.invite, {
      conversationId: groupId,
      peerClerkId: "dave",
    }),
  ).toEqual({ ok: false, reason: "closed" });
  expect(await invite(bob, groupId, "stranger")).toEqual({
    ok: false,
    reason: "unknown",
  });
  expect(await invite(bob, groupId, "carol")).toEqual({
    ok: false,
    reason: "already",
  });

  expect(await invite(bob, groupId, "dave")).toEqual({ ok: true });
  expect(await memberRow(t, groupId, "dave")).toMatchObject({
    kind: "group",
    role: "member",
    status: "invited",
    invitedBy: "bob",
    lastReadAt: 0,
  });
  expect(await invite(alice, groupId, "dave")).toEqual({
    ok: false,
    reason: "already",
  });

  // Erin has blocked the admin doing the inviting.
  await t.run((ctx) =>
    ctx.db.insert("blocks", {
      blocker: "erin",
      blocked: "bob",
      createdAt: Date.now(),
    }),
  );
  expect(await invite(bob, groupId, "erin")).toEqual({
    ok: false,
    reason: "blocked",
  });
  expect(await invite(alice, groupId, "erin")).toEqual({ ok: true });
});

test("invite refuses a full group and somebody who was removed, and readmits a leaver as invited", async () => {
  const { t, groupId, alice } = await setup();
  await seedChatProfiles(t, ["frank", "grace"]);
  await seat(t, groupId, "frank", { status: "banned" });
  await seat(t, groupId, "grace", { status: "left", role: "admin" });

  expect(await invite(alice, groupId, "frank")).toEqual({
    ok: false,
    reason: "not-allowed",
  });
  // Whatever rank the row remembers, a way back in starts as a member.
  expect(await invite(alice, groupId, "grace")).toEqual({ ok: true });
  expect(await standing(t, groupId, "grace")).toEqual(["invited", "member"]);

  await fill(t, groupId);
  expect(await invite(alice, groupId, "dave")).toEqual({
    ok: false,
    reason: "full",
  });
});

test("respondToInvite seats an acceptance and deletes a refusal", async () => {
  const { t, groupId, bob, carol, dave, erin } = await setup();
  await invite(bob, groupId, "dave");
  await invite(bob, groupId, "erin");

  expect(await dave.query(api.chat.groups.invitations, {})).toEqual([
    { conversationId: groupId, title: "Chess club", invitedBy: "bob" },
  ]);

  await dave.mutation(api.chat.groups.respondToInvite, {
    conversationId: groupId,
    accept: true,
  });
  expect(await standing(t, groupId, "dave")).toEqual(["active", "member"]);
  expect(await dave.query(api.chat.groups.invitations, {})).toEqual([]);

  await erin.mutation(api.chat.groups.respondToInvite, {
    conversationId: groupId,
    accept: false,
  });
  expect(await standing(t, groupId, "erin")).toBeNull();

  // Only an invitation can be answered: an active seat is untouched.
  await carol.mutation(api.chat.groups.respondToInvite, {
    conversationId: groupId,
    accept: false,
  });
  expect(await standing(t, groupId, "carol")).toEqual(["active", "member"]);
});

test("requestJoin walks into an open group, waits at a request group, and bounces off an invite group", async () => {
  const { t, dave, alice, bob, carol, erin } = await setup("open");
  const open = (await alice.query(api.chat.conversations.list, {})).find(
    (row) => row.kind === "group",
  )!._id;
  const asked = await alice.mutation(api.chat.conversations.createGroup, {
    title: "Knock first",
    joinPolicy: "request",
  });
  const closed = await alice.mutation(api.chat.conversations.createGroup, {
    title: "Members only",
    joinPolicy: "invite",
  });
  if (!asked.ok || !closed.ok) throw new Error("group not created");

  expect(
    await dave.mutation(api.chat.groups.requestJoin, { conversationId: open }),
  ).toEqual({ ok: true });
  expect(await standing(t, open, "dave")).toEqual(["active", "member"]);
  expect(
    await dave.mutation(api.chat.groups.requestJoin, { conversationId: open }),
  ).toEqual({ ok: false, reason: "already" });

  expect(
    await dave.mutation(api.chat.groups.requestJoin, {
      conversationId: asked.conversationId,
    }),
  ).toEqual({ ok: true });
  expect(await standing(t, asked.conversationId, "dave")).toEqual([
    "requested",
    "member",
  ]);
  expect(
    await dave.mutation(api.chat.groups.requestJoin, {
      conversationId: asked.conversationId,
    }),
  ).toEqual({ ok: false, reason: "already" });

  expect(
    await dave.mutation(api.chat.groups.requestJoin, {
      conversationId: closed.conversationId,
    }),
  ).toEqual({ ok: false, reason: "not-allowed" });
  expect(await standing(t, closed.conversationId, "dave")).toBeNull();

  // Not a group at all, and not signed up at all.
  const dm = (await alice.query(api.chat.conversations.list, {})).find(
    (row) => row.kind === "dm",
  )!._id;
  expect(
    await dave.mutation(api.chat.groups.requestJoin, { conversationId: dm }),
  ).toEqual({ ok: false, reason: "unknown" });
  expect(
    await actor(t, "nobody").mutation(api.chat.groups.requestJoin, {
      conversationId: open,
    }),
  ).toEqual({ ok: false, reason: "closed" });

  // Removed is removed, even from an open door; and a full room is full.
  await bob.mutation(api.chat.groups.kick, {
    conversationId: open,
    clerkId: "carol",
  });
  expect(
    await carol.mutation(api.chat.groups.requestJoin, { conversationId: open }),
  ).toEqual({ ok: false, reason: "not-allowed" });
  await fill(t, open);
  expect(
    await erin.mutation(api.chat.groups.requestJoin, { conversationId: open }),
  ).toEqual({ ok: false, reason: "full" });
});

test("decide lets an admin admit or turn away a request, and nobody else", async () => {
  const { t, alice, bob, carol, dave, erin } = await setup("request");
  const groupId = (await alice.query(api.chat.conversations.list, {})).find(
    (row) => row.kind === "group",
  )!._id;
  await dave.mutation(api.chat.groups.requestJoin, { conversationId: groupId });
  await erin.mutation(api.chat.groups.requestJoin, { conversationId: groupId });

  const waiting = await bob.query(api.chat.groups.requests, {
    conversationId: groupId,
  });
  expect(waiting.map((row) => row.clerkId).sort()).toEqual(["dave", "erin"]);
  expect(waiting[0]).toMatchObject({
    handle: waiting[0].clerkId,
    at: expect.any(Number),
  });
  // A plain member does not see the queue and cannot act on it.
  expect(
    await carol.query(api.chat.groups.requests, { conversationId: groupId }),
  ).toEqual([]);
  await carol.mutation(api.chat.groups.decide, {
    conversationId: groupId,
    clerkId: "dave",
    approve: true,
  });
  expect(await standing(t, groupId, "dave")).toEqual(["requested", "member"]);

  await bob.mutation(api.chat.groups.decide, {
    conversationId: groupId,
    clerkId: "dave",
    approve: true,
  });
  expect(await standing(t, groupId, "dave")).toEqual(["active", "member"]);
  await alice.mutation(api.chat.groups.decide, {
    conversationId: groupId,
    clerkId: "erin",
    approve: false,
  });
  expect(await standing(t, groupId, "erin")).toBeNull();
  expect(
    await bob.query(api.chat.groups.requests, { conversationId: groupId }),
  ).toEqual([]);

  // Deciding about somebody who is not waiting changes nothing.
  await alice.mutation(api.chat.groups.decide, {
    conversationId: groupId,
    clerkId: "carol",
    approve: false,
  });
  expect(await standing(t, groupId, "carol")).toEqual(["active", "member"]);
});

test("kick bans a member, and rank decides who may remove whom", async () => {
  const { t, groupId, alice, bob, carol, dave } = await setup();
  await seedChatProfiles(t, ["frank"]);
  await seat(t, groupId, "frank", { role: "admin" });
  const kick = (who: ConvexActor, clerkId: string) =>
    who.mutation(api.chat.groups.kick, { conversationId: groupId, clerkId });

  // A member cannot kick; an outsider cannot kick; nobody kicks the owner.
  await kick(carol, "bob");
  await kick(dave, "carol");
  await kick(bob, "alice");
  await kick(alice, "alice");
  expect(await standing(t, groupId, "bob")).toEqual(["active", "admin"]);
  expect(await standing(t, groupId, "carol")).toEqual(["active", "member"]);
  expect(await standing(t, groupId, "alice")).toEqual(["active", "owner"]);

  // An admin cannot remove another admin; the owner can.
  await kick(bob, "frank");
  expect(await standing(t, groupId, "frank")).toEqual(["active", "admin"]);
  await kick(alice, "frank");
  expect(await standing(t, groupId, "frank")).toEqual(["banned", "admin"]);

  await kick(bob, "carol");
  expect(await standing(t, groupId, "carol")).toEqual(["banned", "member"]);
  expect(
    await carol.query(api.chat.conversations.get, { conversationId: groupId }),
  ).toBeNull();
  expect(
    (
      await bob.query(api.chat.conversations.members, {
        conversationId: groupId,
      })
    ).map((person) => person.clerkId),
  ).toEqual(["alice", "bob"]);
});

test("setRole is the owner's alone, and never touches the owner", async () => {
  const { t, groupId, alice, bob, carol, dave } = await setup();
  const setRole = (who: ConvexActor, clerkId: string, role: "admin" | "member") =>
    who.mutation(api.chat.groups.setRole, {
      conversationId: groupId,
      clerkId,
      role,
    });

  await setRole(bob, "carol", "admin");
  await setRole(carol, "carol", "admin");
  await setRole(dave, "carol", "admin");
  expect(await standing(t, groupId, "carol")).toEqual(["active", "member"]);

  await setRole(alice, "carol", "admin");
  expect(await standing(t, groupId, "carol")).toEqual(["active", "admin"]);
  await setRole(alice, "bob", "member");
  expect(await standing(t, groupId, "bob")).toEqual(["active", "member"]);

  // The owner cannot demote themself, and an outsider has no role to set.
  await setRole(alice, "alice", "member");
  expect(await standing(t, groupId, "alice")).toEqual(["active", "owner"]);
  await setRole(alice, "dave", "admin");
  expect(await standing(t, groupId, "dave")).toBeNull();

  // Not an active seat, so not promotable.
  await invite(alice, groupId, "dave");
  await setRole(alice, "dave", "admin");
  expect(await standing(t, groupId, "dave")).toEqual(["invited", "member"]);
});

test("leave hands ownership to the longest-standing admin, else the longest-standing member", async () => {
  const { t, groupId, alice, bob, carol } = await setup();
  await seedChatProfiles(t, ["frank"]);
  // Frank is an admin too, but newer than bob.
  await seat(t, groupId, "frank", { role: "admin", joinedAt: 5_000 });

  await alice.mutation(api.chat.groups.leave, { conversationId: groupId });
  expect(await standing(t, groupId, "alice")).toEqual(["left", "member"]);
  expect(await standing(t, groupId, "bob")).toEqual(["active", "owner"]);
  expect(await standing(t, groupId, "frank")).toEqual(["active", "admin"]);
  expect(
    await alice.query(api.chat.conversations.get, { conversationId: groupId }),
  ).toBeNull();

  // Leaving again from a `left` row changes nothing.
  await alice.mutation(api.chat.groups.leave, { conversationId: groupId });
  expect(await standing(t, groupId, "alice")).toEqual(["left", "member"]);

  // With no admin left, the oldest member inherits. Carol (2000) beats a
  // newer member; frank steps down first so there is no admin to prefer.
  await seedChatProfiles(t, ["grace"]);
  await seat(t, groupId, "grace", { joinedAt: 9_000 });
  await actor(t, "frank").mutation(api.chat.groups.leave, {
    conversationId: groupId,
  });
  expect(await standing(t, groupId, "frank")).toEqual(["left", "member"]);
  await bob.mutation(api.chat.groups.leave, { conversationId: groupId });
  expect(await standing(t, groupId, "bob")).toEqual(["left", "member"]);
  expect(await standing(t, groupId, "carol")).toEqual(["active", "owner"]);
  expect(await standing(t, groupId, "grace")).toEqual(["active", "member"]);

  // A member leaving hands nothing on.
  await actor(t, "grace").mutation(api.chat.groups.leave, {
    conversationId: groupId,
  });
  expect(await standing(t, groupId, "carol")).toEqual(["active", "owner"]);
  expect(
    await carol.query(api.chat.conversations.get, { conversationId: groupId }),
  ).toMatchObject({ role: "owner" });
});

test("the last one out takes the group with them", async () => {
  vi.useFakeTimers();
  const { t, groupId, alice, bob, carol } = await setup();
  await alice.mutation(api.chat.messages.send, {
    conversationId: groupId,
    body: "@everyone last orders",
  });
  await t.run((ctx) =>
    ctx.db.insert("reports", {
      reporterClerkId: "bob",
      targetClerkId: "alice",
      conversationId: groupId,
      reason: "spam",
      createdAt: Date.now(),
    }),
  );
  await bob.mutation(api.chat.groups.leave, { conversationId: groupId });
  await carol.mutation(api.chat.groups.leave, { conversationId: groupId });
  // Bob and carol left rows behind; alice is the one who empties the room.
  expect(await t.run((ctx) => ctx.db.get(groupId))).not.toBeNull();

  await alice.mutation(api.chat.groups.leave, { conversationId: groupId });
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").take(10),
  );
  expect(
    jobs.filter((job) => job.name.includes("purgeConversation")),
  ).toHaveLength(1);
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());

  expect(await t.run((ctx) => ctx.db.get(groupId))).toBeNull();
  const leftovers = await t.run(async (ctx) => ({
    members: await ctx.db
      .query("conversationMembers")
      .withIndex("byConversation", (q) => q.eq("conversationId", groupId))
      .collect(),
    messages: await ctx.db
      .query("messages")
      .withIndex("byConversation", (q) => q.eq("conversationId", groupId))
      .collect(),
    mentions: await ctx.db.query("mentions").collect(),
    reports: await ctx.db.query("reports").collect(),
  }));
  expect(leftovers).toEqual({
    members: [],
    messages: [],
    mentions: [],
    reports: [],
  });
  expect(
    (await alice.query(api.chat.conversations.list, {})).map((row) => row.kind),
  ).toEqual(["global", "dm"]);
});

test("setJoinPolicy is the owner's alone", async () => {
  const { t, groupId, alice, bob, carol } = await setup("invite");
  const policy = async () =>
    (await t.run((ctx) => ctx.db.get(groupId)))?.joinPolicy;

  await bob.mutation(api.chat.groups.setJoinPolicy, {
    conversationId: groupId,
    joinPolicy: "open",
  });
  await carol.mutation(api.chat.groups.setJoinPolicy, {
    conversationId: groupId,
    joinPolicy: "open",
  });
  expect(await policy()).toBe("invite");

  await alice.mutation(api.chat.groups.setJoinPolicy, {
    conversationId: groupId,
    joinPolicy: "request",
  });
  expect(await policy()).toBe("request");
  expect(
    await bob.query(api.chat.conversations.get, { conversationId: groupId }),
  ).toMatchObject({ joinPolicy: "request" });
});

test("rename is screened like the title and open to admins", async () => {
  const { t, groupId, alice, bob, carol } = await setup();
  const title = async () => (await t.run((ctx) => ctx.db.get(groupId)))?.title;
  const rename = (who: ConvexActor, next: string) =>
    who.mutation(api.chat.groups.rename, {
      conversationId: groupId,
      title: next,
    });

  expect(await rename(carol, "Carol's club")).toEqual({
    ok: false,
    reason: "not-allowed",
  });
  expect(
    await actor(t, "nobody").mutation(api.chat.groups.rename, {
      conversationId: groupId,
      title: "Nobody's club",
    }),
  ).toEqual({ ok: false, reason: "closed" });
  expect(await rename(bob, "nigger")).toEqual({
    ok: false,
    reason: "not-allowed",
  });
  expect(await rename(bob, "   ")).toEqual({
    ok: false,
    reason: "not-allowed",
  });
  expect(await title()).toBe("Chess club");

  expect(await rename(bob, "  Chess society ")).toEqual({ ok: true });
  expect(await title()).toBe("Chess society");
  expect(await rename(alice, "Draughts")).toEqual({ ok: true });
  expect(
    await carol.query(api.chat.conversations.get, { conversationId: groupId }),
  ).toMatchObject({ title: "Draughts" });
});

test("setLook keeps what the picker offers and drops everything else", async () => {
  const { t, groupId, alice, bob, carol } = await setup();
  const look = async () => {
    const row = await t.run((ctx) => ctx.db.get(groupId));
    return { emoji: row?.emoji, initials: row?.initials, hue: row?.hue };
  };
  const setLook = (
    who: ConvexActor,
    face: { emoji?: string; initials?: string; hue?: number },
  ) => who.mutation(api.chat.groups.setLook, { conversationId: groupId, ...face });

  await setLook(bob, { emoji: "🎮", hue: 130 });
  expect(await look()).toEqual({ emoji: "🎮", initials: undefined, hue: 130 });

  // Off the wheel and off the list: both dropped, and the old face is gone
  // because the whole face is written every time.
  await setLook(alice, { emoji: "🍔", hue: 131 });
  expect(await look()).toEqual({
    emoji: undefined,
    initials: undefined,
    hue: undefined,
  });

  // Initials only without an emoji, at most two alphanumerics.
  await setLook(alice, { initials: " cc ", hue: 340 });
  expect(await look()).toEqual({ emoji: undefined, initials: "cc", hue: 340 });
  await setLook(alice, { initials: "C7", emoji: "🦊" });
  expect(await look()).toEqual({ emoji: "🦊", initials: undefined, hue: undefined });
  await setLook(alice, { initials: "abc" });
  expect(await look()).toEqual({
    emoji: undefined,
    initials: undefined,
    hue: undefined,
  });
  await setLook(alice, { initials: "a!" });
  expect((await look()).initials).toBeUndefined();
  await setLook(alice, { initials: "" });
  expect((await look()).initials).toBeUndefined();

  // The face shows up where the group is drawn.
  await setLook(alice, { emoji: "🚀", hue: 10 });
  expect(
    await carol.query(api.chat.conversations.get, { conversationId: groupId }),
  ).toMatchObject({ emoji: "🚀", hue: 10 });
  expect(
    (await carol.query(api.chat.conversations.list, {})).find(
      (row) => row._id === groupId,
    ),
  ).toMatchObject({ emoji: "🚀", hue: 10 });

  // A member cannot touch it, and an empty call from an admin resets it.
  await setLook(carol, { emoji: "🐙" });
  expect(await look()).toEqual({ emoji: "🚀", initials: undefined, hue: 10 });
  await setLook(bob, {});
  expect(await look()).toEqual({
    emoji: undefined,
    initials: undefined,
    hue: undefined,
  });
});

test("invitations lists only group invitations still waiting on the caller", async () => {
  const { t, groupId, alice, bob, dave } = await setup();
  const other = await bob.mutation(api.chat.conversations.createGroup, {
    title: "Second group",
    joinPolicy: "invite",
  });
  if (!other.ok) throw new Error("group not created");
  await invite(alice, groupId, "dave");
  await invite(bob, other.conversationId, "dave");
  // An invitation whose inviter has since vanished still lists, unnamed.
  await seat(t, other.conversationId, "erin", { status: "invited" });

  expect(
    (await dave.query(api.chat.groups.invitations, {})).sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
  ).toEqual([
    { conversationId: groupId, title: "Chess club", invitedBy: "alice" },
    {
      conversationId: other.conversationId,
      title: "Second group",
      invitedBy: "bob",
    },
  ]);
  expect(await actor(t, "erin").query(api.chat.groups.invitations, {})).toEqual([
    {
      conversationId: other.conversationId,
      title: "Second group",
      invitedBy: undefined,
    },
  ]);
  expect(await alice.query(api.chat.groups.invitations, {})).toEqual([]);
  expect(await actor(t, "nobody").query(api.chat.groups.invitations, {})).toEqual(
    [],
  );

  await dave.mutation(api.chat.groups.respondToInvite, {
    conversationId: groupId,
    accept: false,
  });
  expect(
    (await dave.query(api.chat.groups.invitations, {})).map(
      (row) => row.conversationId,
    ),
  ).toEqual([other.conversationId]);
});
