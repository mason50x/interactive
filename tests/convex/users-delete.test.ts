import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  actor,
  makeConvexTest,
  seedChatPair,
  seedChatProfiles,
  seedUsers,
} from "../helpers/convex";

afterEach(() => vi.useRealTimers());

const page = { numItems: 50, cursor: null };
const day = { dayStart: 0, dayEnd: Number.MAX_SAFE_INTEGER };

/**
 * Alice with a foot in every table: Everyone, a bot DM, a group she owns with
 * bob in it, a friend DM with bob, messages that name people and are named
 * in, a block, reports filed and received, preferences, views, days and a
 * simulator entry with a save.
 */
async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  const t = makeConvexTest({ rateLimited: true });
  await seedUsers(t, ["alice", "bob", "carol"]);
  const pair = await seedChatPair(t);
  const { alice, bob, global } = pair;
  await seedChatProfiles(t, ["carol"]);
  const carol = actor(t, "carol");
  await carol.mutation(api.chat.profiles.joinGlobal, {});

  // A group alice owns with bob as a member.
  const created = await alice.mutation(api.chat.conversations.createGroup, {
    title: "Study group",
    joinPolicy: "invite",
  });
  if (!created.ok) throw new Error(created.reason);
  const group = created.conversationId;
  await alice.mutation(api.chat.groups.invite, {
    conversationId: group,
    peerClerkId: "bob",
  });
  await bob.mutation(api.chat.groups.respondToInvite, {
    conversationId: group,
    accept: true,
  });

  // Friends, which builds the direct message.
  await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" });
  await bob.mutation(api.chat.friends.accept, { peerClerkId: "alice" });
  const opened = await alice.mutation(api.chat.conversations.openDm, {
    peerClerkId: "bob",
  });
  if (!opened.ok) throw new Error(opened.reason);
  const dm = opened.conversationId;

  // Messages with mention rows in both directions.
  const send = async (
    who: typeof alice,
    conversationId: Id<"conversations">,
    body: string,
  ) => {
    vi.setSystemTime(Date.now() + 1_000);
    const result = await who.mutation(api.chat.messages.send, {
      conversationId,
      body,
    });
    if (!result.ok) throw new Error(result.refusal);
  };
  await send(alice, global, "@bob morning");
  await send(bob, global, "@alice morning to you");
  await send(carol, global, "Nobody named here");
  await send(alice, dm, "Private hello");
  await send(bob, dm, "Private reply");
  await send(alice, group, "@everyone welcome");
  await send(bob, group, "Thanks");

  // Mid-sentence and in the room at the moment the account goes.
  for (const who of [alice, bob]) {
    await who.mutation(api.chat.typing.start, { conversationId: global });
    await who.mutation(api.chat.presence.here, { conversationId: global });
  }

  // Blocks in both directions, with carol rather than bob so that the
  // friendship with bob is still standing when the account goes.
  await alice.mutation(api.chat.blocks.block, { peerClerkId: "carol" });
  await carol.mutation(api.chat.blocks.block, { peerClerkId: "alice" });

  const aliceMessage = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("byAuthor", (q) => q.eq("authorClerkId", "alice"))
      .first(),
  );
  const bobMessage = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("byAuthor", (q) => q.eq("authorClerkId", "bob"))
      .first(),
  );
  await alice.mutation(api.chat.reports.report, {
    messageId: bobMessage!._id,
    targetClerkId: "bob",
    reason: "spam",
  });
  await carol.mutation(api.chat.reports.report, {
    messageId: aliceMessage!._id,
    targetClerkId: "alice",
    reason: "spam",
  });
  // A report between two other people, which must survive.
  await carol.mutation(api.chat.reports.report, {
    targetClerkId: "bob",
    reason: "other",
  });

  await alice.mutation(api.preferences.save, { accent: "violet" });
  await bob.mutation(api.preferences.save, { accent: "teal" });
  await alice.mutation(api.views.opened, { slug: "snake", tzOffsetMinutes: 0 });
  await bob.mutation(api.views.opened, { slug: "snake", tzOffsetMinutes: 0 });

  await t.run(async (ctx) => {
    for (const owner of ["alice", "bob"]) {
      const entryId = await ctx.db.insert("simulatorEntries", {
        ownerClerkId: owner,
        contentHash: "a".repeat(64),
        label: "Cart",
        source: "imported",
        mode: "color",
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
        updatedAt: Date.now(),
        revision: 1,
      });
      await ctx.db.insert("simulatorSaves", {
        ownerClerkId: owner,
        entryId,
        slot: "auto",
        revision: 1,
        savedAt: Date.now(),
        captureId: "cap",
        engineBuild: "c60e138",
        formatVersion: 1,
        capturedAt: Date.now(),
        checkpoint: new ArrayBuffer(8),
      });
      await ctx.db.insert("htmlSimulatorEntries", {
        ownerClerkId: owner,
        contentHash: "b".repeat(64),
        label: "Page",
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
      });
    }
    await ctx.db.insert("invites", {
      inviterClerkId: "alice",
      email: "friend@example.com",
      status: "sent",
    });
  });

  return { t, alice, bob, carol, global, dm, group, botDm: pair.dm };
}

/** Every row in every table that carries `clerkId`, filtered to one account. */
async function rowsNaming(t: ReturnType<typeof makeConvexTest>, id: string) {
  return await t.run(async (ctx) => {
    const all = async <T extends { [key: string]: unknown }>(
      rows: T[],
      pick: (row: T) => unknown[],
    ) => rows.filter((row) => pick(row).includes(id)).length;
    return {
      users: await all(await ctx.db.query("users").collect(), (r) => [r.clerkId]),
      invites: await all(await ctx.db.query("invites").collect(), (r) => [
        r.inviterClerkId,
      ]),
      preferences: await all(
        await ctx.db.query("preferences").collect(),
        (r) => [r.clerkId],
      ),
      views: await all(await ctx.db.query("views").collect(), (r) => [r.clerkId]),
      userDays: await all(await ctx.db.query("userDays").collect(), (r) => [
        r.clerkId,
      ]),
      chatProfiles: await all(
        await ctx.db.query("chatProfiles").collect(),
        (r) => [r.clerkId],
      ),
      chatSenders: await all(
        await ctx.db.query("chatSenders").collect(),
        (r) => [r.clerkId],
      ),
      conversationMembers: await all(
        await ctx.db.query("conversationMembers").collect(),
        (r) => [r.clerkId],
      ),
      messages: await all(await ctx.db.query("messages").collect(), (r) => [
        r.authorClerkId,
      ]),
      mentions: await all(await ctx.db.query("mentions").collect(), (r) => [
        r.target,
        r.authorClerkId,
      ]),
      friendships: await all(
        await ctx.db.query("friendships").collect(),
        (r) => [r.userA, r.userB],
      ),
      blocks: await all(await ctx.db.query("blocks").collect(), (r) => [
        r.blocker,
        r.blocked,
      ]),
      reports: await all(await ctx.db.query("reports").collect(), (r) => [
        r.reporterClerkId,
        r.targetClerkId,
      ]),
      typing: await all(await ctx.db.query("typing").collect(), (r) => [
        r.clerkId,
      ]),
      presence: await all(await ctx.db.query("presence").collect(), (r) => [
        r.clerkId,
      ]),
      simulatorEntries: await all(
        await ctx.db.query("simulatorEntries").collect(),
        (r) => [r.ownerClerkId],
      ),
      simulatorSaves: await all(
        await ctx.db.query("simulatorSaves").collect(),
        (r) => [r.ownerClerkId],
      ),
      htmlSimulatorEntries: await all(
        await ctx.db.query("htmlSimulatorEntries").collect(),
        (r) => [r.ownerClerkId],
      ),
    };
  });
}

test("deleteFromClerk cascades through every table that names the account", async () => {
  const { t, bob, carol, global, dm, group, botDm } = await setup();
  const before = await rowsNaming(t, "alice");
  // Everything seeded is in place before the deletion.
  expect(
    Object.entries(before)
      .filter(([, n]) => n === 0)
      .map(([key]) => key),
  ).toEqual([]);
  expect(before.conversationMembers).toBe(4);
  expect(before.mentions).toBe(3);
  const bobBefore = await rowsNaming(t, "bob");

  expect(
    await t.mutation(internal.users.deleteFromClerk, { clerkId: "alice" }),
  ).toEqual({ deleted: 1, invites: 1, preferences: 1, views: 1, days: 1 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const after = await rowsNaming(t, "alice");
  // Everything goes now, including the "typing" and "here" rows in rooms
  // that survive her, rather than waiting for the hourly sweeps.
  expect(after).toEqual(
    Object.fromEntries(Object.keys(after).map((key) => [key, 0])),
  );

  // Bob's own things are untouched, except what alice's leaving took with
  // it: the friendship, his seat in their DM and the words he said in it,
  // both mention rows (the one her message wrote for him and the one his
  // wrote for her), and the report she filed against him.
  const bobAfter = await rowsNaming(t, "bob");
  expect(bobAfter).toEqual({
    ...bobBefore,
    friendships: 0,
    conversationMembers: bobBefore.conversationMembers - 1,
    messages: bobBefore.messages - 1,
    mentions: 0,
    reports: bobBefore.reports - 1,
  });
  // Carol's blocks were both about alice, so both went; nothing else of
  // hers did.
  expect((await rowsNaming(t, "carol")).blocks).toBe(0);

  // The direct messages are gone whole; the group and the room stay.
  expect(await t.run((ctx) => ctx.db.get(dm))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(botDm))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(global))).not.toBeNull();
  expect(await t.run((ctx) => ctx.db.get(group))).not.toBeNull();
  // Bob inherits the group.
  const bobSeat = await t.run((ctx) =>
    ctx.db
      .query("conversationMembers")
      .withIndex("byConversationUser", (q) =>
        q.eq("conversationId", group).eq("clerkId", "bob"),
      )
      .unique(),
  );
  expect(bobSeat).toMatchObject({ role: "owner", status: "active" });
  // Nobody is stamped as the room's creator any more.
  expect((await t.run((ctx) => ctx.db.get(global)))?.createdBy).toBe("");

  // What the others still see of the room: their own words, not hers.
  const thread = await carol.query(api.chat.messages.list, {
    conversationId: global,
    ...day,
    paginationOpts: page,
  });
  expect(thread.page.map((m) => m.authorClerkId)).toEqual(["carol", "bob"]);
  expect(
    (await bob.query(api.chat.conversations.list, {})).map((c) => c._id),
  ).toEqual(expect.arrayContaining([global, group]));
  // The report carol filed about bob is still there.
  const reports = await t.run((ctx) => ctx.db.query("reports").collect());
  expect(reports.map((r) => [r.reporterClerkId, r.targetClerkId])).toEqual([
    ["carol", "bob"],
  ]);

  // Replaying the webhook is a no-op.
  expect(
    await t.mutation(internal.users.deleteFromClerk, { clerkId: "alice" }),
  ).toEqual({ deleted: 0, invites: 0, preferences: 0, views: 0, days: 0 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await rowsNaming(t, "bob")).toEqual(bobAfter);

  // The two rows left behind go with the hourly sweeps.
  vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
  await t.mutation(internal.chat.sweep.sweepTyping, {});
  await t.mutation(internal.chat.sweep.sweepPresence, {});
  const swept = await rowsNaming(t, "alice");
  expect([swept.typing, swept.presence]).toEqual([0, 0]);
});

test("deleting an unknown account touches nothing", async () => {
  const { t } = await setup();
  const bob = await rowsNaming(t, "bob");
  expect(
    await t.mutation(internal.users.deleteFromClerk, { clerkId: "nobody" }),
  ).toEqual({ deleted: 0, invites: 0, preferences: 0, views: 0, days: 0 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await rowsNaming(t, "bob")).toEqual(bob);
  // Everyone, three bot DMs, the group and the friend DM.
  expect(
    await t.run((ctx) => ctx.db.query("conversations").collect()),
  ).toHaveLength(6);
});

test("trimGlobal deletes only global-room messages older than the cutoff", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-01T12:00:00Z"));
  const t = makeConvexTest({ rateLimited: true });
  const { alice, bob, global } = await seedChatPair(t);
  // A real pair DM rather than alice's bot DM, where every message is a
  // question for the bot and would schedule a reply.
  await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" });
  await bob.mutation(api.chat.friends.accept, { peerClerkId: "alice" });
  const opened = await alice.mutation(api.chat.conversations.openDm, {
    peerClerkId: "bob",
  });
  if (!opened.ok) throw new Error(opened.reason);
  const dm = opened.conversationId;

  const send = async (who: typeof alice, conversationId: Id<"conversations">, body: string) => {
    vi.setSystemTime(Date.now() + 60_000);
    expect(
      await who.mutation(api.chat.messages.send, { conversationId, body }),
    ).toEqual({ ok: true });
  };
  await send(alice, global, "@bob old room message");
  await send(bob, global, "Old room reply");
  await send(alice, dm, "Old private message");
  const cutoff = Date.now() + 1;
  await send(alice, global, "New room message");
  await send(alice, dm, "New private message");

  expect(
    await t.run((ctx) =>
      ctx.db
        .query("mentions")
        .withIndex("byTargetConversation", (q) => q.eq("target", "bob"))
        .collect(),
    ),
  ).toHaveLength(1);

  expect(await t.mutation(internal.chat.sweep.trimGlobal, { cutoff })).toBe(2);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const bodies = await t.run(async (ctx) =>
    (await ctx.db.query("messages").collect()).map((m) => m.body).sort(),
  );
  expect(bodies).toEqual([
    "New private message",
    "New room message",
    "Old private message",
  ]);
  // The mention rows went with the message that wrote them.
  expect(await t.run((ctx) => ctx.db.query("mentions").collect())).toEqual([]);

  // Nothing older than the cutoff is left, so a second pass finds nothing.
  expect(await t.mutation(internal.chat.sweep.trimGlobal, { cutoff })).toBe(0);
  // Without a cutoff the default is GLOBAL_RETENTION_MS ago: everything here
  // is recent, so nothing goes.
  expect(await t.mutation(internal.chat.sweep.trimGlobal, {})).toBe(0);
  vi.setSystemTime(Date.now() + 31 * 86_400_000);
  expect(await t.mutation(internal.chat.sweep.trimGlobal, {})).toBe(1);
  expect(
    await t.run(async (ctx) =>
      (await ctx.db.query("messages").collect()).map((m) => m.body).sort(),
    ),
  ).toEqual(["New private message", "Old private message"]);
});

test("trimGlobal is a no-op with no global room", async () => {
  const t = makeConvexTest();
  expect(await t.mutation(internal.chat.sweep.trimGlobal, {})).toBe(0);
});

test("sweepPresence and sweepTyping drop only rows an hour past their window", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  const t = makeConvexTest();
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const conversationId = await t.run((ctx) =>
    ctx.db.insert("conversations", {
      kind: "group",
      title: "Room",
      createdBy: "alice",
      createdAt: now,
    }),
  );
  await t.run(async (ctx) => {
    for (const [clerkId, age] of [
      ["fresh", 0],
      ["stale", 5 * 60_000],
      ["edge", hour],
      ["dead", hour + 1],
      ["ancient", 7 * 24 * hour],
    ] as const) {
      await ctx.db.insert("presence", {
        conversationId,
        clerkId,
        lastSeenAt: now - age,
      });
      await ctx.db.insert("typing", {
        conversationId,
        clerkId,
        handle: clerkId,
        until: now - age,
      });
    }
  });

  expect(await t.mutation(internal.chat.sweep.sweepPresence, {})).toBe(2);
  expect(await t.mutation(internal.chat.sweep.sweepTyping, {})).toBe(2);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const remaining = await t.run(async (ctx) => ({
    presence: (await ctx.db.query("presence").collect())
      .map((r) => r.clerkId)
      .sort(),
    typing: (await ctx.db.query("typing").collect())
      .map((r) => r.clerkId)
      .sort(),
  }));
  // `lt` on the boundary: a row exactly an hour old is kept.
  expect(remaining).toEqual({
    presence: ["edge", "fresh", "stale"],
    typing: ["edge", "fresh", "stale"],
  });
  // Idempotent.
  expect(await t.mutation(internal.chat.sweep.sweepPresence, {})).toBe(0);
  expect(await t.mutation(internal.chat.sweep.sweepTyping, {})).toBe(0);
});
