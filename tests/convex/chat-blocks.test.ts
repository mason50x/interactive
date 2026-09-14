import { afterEach, expect, test, vi } from "vitest";
import { api } from "@convex/_generated/api";
import {
  actor,
  makeConvexTest,
  seedChatPair,
  seedChatProfiles,
} from "../helpers/convex";

afterEach(() => vi.useRealTimers());

async function setup() {
  const t = makeConvexTest({ rateLimited: true });
  const pair = await seedChatPair(t);
  await seedChatProfiles(t, ["carol"]);
  const carol = actor(t, "carol");
  await carol.mutation(api.chat.profiles.joinGlobal, {});
  return { t, carol, ...pair };
}

const page = { numItems: 20, cursor: null };
const day = { dayStart: 0, dayEnd: Number.MAX_SAFE_INTEGER };

async function blocks(t: ReturnType<typeof makeConvexTest>) {
  return await t.run((ctx) => ctx.db.query("blocks").collect());
}

test("block refuses self, is idempotent, and lists by handle", async () => {
  const { t, alice } = await setup();
  await alice.mutation(api.chat.blocks.block, { peerClerkId: "alice" });
  expect(await blocks(t)).toEqual([]);

  await alice.mutation(api.chat.blocks.block, { peerClerkId: "bob" });
  await alice.mutation(api.chat.blocks.block, { peerClerkId: "bob" });
  const rows = await blocks(t);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ blocker: "alice", blocked: "bob" });

  // A row for a peer nobody has a profile for is still listed, unnamed.
  await alice.mutation(api.chat.blocks.block, { peerClerkId: "gone" });
  expect(await alice.query(api.chat.blocks.list, {})).toEqual([
    { clerkId: "bob", handle: "bob" },
    { clerkId: "gone", handle: "unknown" },
  ]);
  // Directional: bob's list is untouched.
  expect(await actor(t, "bob").query(api.chat.blocks.list, {})).toEqual([]);
  expect(await t.query(api.chat.blocks.list, {})).toEqual([]);
  expect(await actor(t, "ghost").query(api.chat.blocks.list, {})).toEqual([]);
});

test("unblock removes only the caller's own row", async () => {
  const { t, alice, bob } = await setup();
  await alice.mutation(api.chat.blocks.block, { peerClerkId: "bob" });
  await bob.mutation(api.chat.blocks.block, { peerClerkId: "alice" });

  // Nothing to undo is not an error.
  await alice.mutation(api.chat.blocks.unblock, { peerClerkId: "carol" });
  expect(await blocks(t)).toHaveLength(2);

  await alice.mutation(api.chat.blocks.unblock, { peerClerkId: "bob" });
  expect((await blocks(t)).map((r) => [r.blocker, r.blocked])).toEqual([
    ["bob", "alice"],
  ]);
  expect(await alice.query(api.chat.blocks.list, {})).toEqual([]);
});

test("blocking a friend ends the friendship and takes the DM out of the blocker's list only", async () => {
  const { t, alice, bob } = await setup();
  await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" });
  await bob.mutation(api.chat.friends.accept, { peerClerkId: "alice" });
  const opened = await alice.mutation(api.chat.conversations.openDm, {
    peerClerkId: "bob",
  });
  expect(opened.ok).toBe(true);
  const dmId = opened.ok ? opened.conversationId : null;

  await alice.mutation(api.chat.blocks.block, { peerClerkId: "bob" });

  expect(await t.run((ctx) => ctx.db.query("friendships").collect())).toEqual(
    [],
  );
  const members = await t.run((ctx) =>
    ctx.db
      .query("conversationMembers")
      .withIndex("byConversation", (q) => q.eq("conversationId", dmId!))
      .collect(),
  );
  expect(
    Object.fromEntries(members.map((m) => [m.clerkId, m.status])),
  ).toEqual({ alice: "left", bob: "active" });
  // The conversation itself is not destroyed.
  expect(await t.run((ctx) => ctx.db.get(dmId!))).not.toBeNull();

  const mine = await alice.query(api.chat.conversations.list, {});
  expect(mine.some((c) => c._id === dmId)).toBe(false);
  const theirs = await bob.query(api.chat.conversations.list, {});
  expect(theirs.some((c) => c._id === dmId)).toBe(true);

  // Neither side can open (or send into) the thread while the block stands.
  expect(
    await alice.mutation(api.chat.conversations.openDm, { peerClerkId: "bob" }),
  ).toEqual({ ok: false, reason: "blocked" });
  expect(
    await bob.mutation(api.chat.conversations.openDm, { peerClerkId: "alice" }),
  ).toEqual({ ok: false, reason: "blocked" });
  expect(
    await bob.mutation(api.chat.messages.send, {
      conversationId: dmId!,
      body: "Are you there",
    }),
  ).toEqual({ ok: false, refusal: "blocked" });

  // Unblocking does not restore the friendship; it has to be asked for again.
  await alice.mutation(api.chat.blocks.unblock, { peerClerkId: "bob" });
  expect(
    await alice.mutation(api.chat.conversations.openDm, { peerClerkId: "bob" }),
  ).toEqual({ ok: false, reason: "not-friends" });
  await bob.mutation(api.chat.friends.request, { peerClerkId: "alice" });
  await alice.mutation(api.chat.friends.accept, { peerClerkId: "bob" });
  // The same thread comes back, with alice's seat active again.
  expect(
    await alice.mutation(api.chat.conversations.openDm, { peerClerkId: "bob" }),
  ).toEqual({ ok: true, conversationId: dmId });
  expect(
    (await alice.query(api.chat.conversations.list, {})).some(
      (c) => c._id === dmId,
    ),
  ).toBe(true);
});

test("a block hides the blocked author's messages from the blocker alone", async () => {
  vi.useFakeTimers();
  const { t, alice, bob, carol, global } = await setup();
  for (const [who, body] of [
    [bob, "Morning everyone"],
    [carol, "Hello from carol"],
    [alice, "Hi both"],
  ] as const) {
    vi.setSystemTime(Date.now() + 1_000);
    expect(
      await who.mutation(api.chat.messages.send, {
        conversationId: global,
        body,
      }),
    ).toEqual({ ok: true });
  }

  await alice.mutation(api.chat.blocks.block, { peerClerkId: "bob" });

  const forAlice = await alice.query(api.chat.messages.list, {
    conversationId: global,
    ...day,
    paginationOpts: page,
  });
  expect(forAlice.page.map((m) => m.body)).toEqual([
    "Hi both",
    "Hello from carol",
  ]);
  // Carol and bob still see everything.
  const forCarol = await carol.query(api.chat.messages.list, {
    conversationId: global,
    ...day,
    paginationOpts: page,
  });
  expect(forCarol.page.map((m) => m.body)).toEqual([
    "Hi both",
    "Hello from carol",
    "Morning everyone",
  ]);
  const forBob = await bob.query(api.chat.messages.list, {
    conversationId: global,
    ...day,
    paginationOpts: page,
  });
  expect(forBob.page).toHaveLength(3);

  // A mention from the blocked author does not light the blocker's list.
  vi.setSystemTime(Date.now() + 1_000);
  await bob.mutation(api.chat.messages.send, {
    conversationId: global,
    body: "@carol look at this",
  });
  expect(
    await bob.mutation(api.chat.messages.send, {
      conversationId: global,
      body: "@alice look at this",
    }),
  ).toEqual({ ok: false, refusal: "mention" });
  expect(
    (await alice.query(api.chat.conversations.list, {}))[0],
  ).toMatchObject({ kind: "global", mentioned: false });

  // Unblocking brings the history back.
  await alice.mutation(api.chat.blocks.unblock, { peerClerkId: "bob" });
  const after = await alice.query(api.chat.messages.list, {
    conversationId: global,
    ...day,
    paginationOpts: page,
  });
  expect(after.page.map((m) => m.authorClerkId)).toEqual([
    "bob",
    "alice",
    "carol",
    "bob",
  ]);
  expect(t).toBeDefined();
});
