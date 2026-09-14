import { afterEach, expect, test, vi } from "vitest";
import { api } from "@convex/_generated/api";
import { PRESENCE_WINDOW_MS } from "@convex/chat/presence";
import { TYPING_WINDOW_MS } from "@convex/chat/typing";
import {
  actor,
  makeConvexTest,
  seedChatPair,
  seedChatProfiles,
} from "../helpers/convex";

afterEach(() => vi.useRealTimers());

async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  const t = makeConvexTest();
  const pair = await seedChatPair(t);
  await seedChatProfiles(t, ["carol"]);
  const carol = actor(t, "carol");
  await carol.mutation(api.chat.profiles.joinGlobal, {});
  // A stranger with a handle but no seat anywhere.
  await seedChatProfiles(t, ["dave"]);
  const dave = actor(t, "dave");
  return { t, carol, dave, ...pair };
}

async function typingRows(t: ReturnType<typeof makeConvexTest>) {
  return await t.run((ctx) => ctx.db.query("typing").collect());
}

async function presenceRows(t: ReturnType<typeof makeConvexTest>) {
  return await t.run((ctx) => ctx.db.query("presence").collect());
}

test("typing.start writes one row until now + TYPING_WINDOW_MS and refuses a young rewrite", async () => {
  const { t, alice, global } = await setup();
  const t0 = Date.now();
  await alice.mutation(api.chat.typing.start, { conversationId: global });
  let rows = await typingRows(t);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    conversationId: global,
    clerkId: "alice",
    handle: "alice",
    until: t0 + TYPING_WINDOW_MS,
  });

  // Two seconds later the row is still young: read and left alone.
  vi.setSystemTime(t0 + 2_000);
  await alice.mutation(api.chat.typing.start, { conversationId: global });
  rows = await typingRows(t);
  expect(rows).toHaveLength(1);
  expect(rows[0].until).toBe(t0 + TYPING_WINDOW_MS);

  // Past the refresh threshold it is rewritten forward.
  vi.setSystemTime(t0 + 3_000);
  await alice.mutation(api.chat.typing.start, { conversationId: global });
  rows = await typingRows(t);
  expect(rows).toHaveLength(1);
  expect(rows[0].until).toBe(t0 + 3_000 + TYPING_WINDOW_MS);
});

test("typing.start writes nothing for strangers, non-members, or a blocked DM", async () => {
  const { t, alice, bob, dave, global } = await setup();
  await t.mutation(api.chat.typing.start, { conversationId: global });
  await actor(t, "ghost").mutation(api.chat.typing.start, {
    conversationId: global,
  });
  await dave.mutation(api.chat.typing.start, { conversationId: global });
  expect(await typingRows(t)).toEqual([]);

  // A friend DM that a block has since landed on.
  await alice.mutation(api.chat.friends.request, { peerClerkId: "bob" });
  await bob.mutation(api.chat.friends.accept, { peerClerkId: "alice" });
  const opened = await alice.mutation(api.chat.conversations.openDm, {
    peerClerkId: "bob",
  });
  const dm = opened.ok ? opened.conversationId : null;
  await bob.mutation(api.chat.typing.start, { conversationId: dm! });
  expect(await typingRows(t)).toHaveLength(1);
  await bob.mutation(api.chat.typing.stop, { conversationId: dm! });

  await alice.mutation(api.chat.blocks.block, { peerClerkId: "bob" });
  // Bob is still an active member of the thread, but the block bars him.
  await bob.mutation(api.chat.typing.start, { conversationId: dm! });
  expect(await typingRows(t)).toEqual([]);
});

test("typing.stop deletes the caller's row and nothing else", async () => {
  const { t, alice, bob, global } = await setup();
  await alice.mutation(api.chat.typing.start, { conversationId: global });
  await bob.mutation(api.chat.typing.start, { conversationId: global });
  await alice.mutation(api.chat.typing.stop, { conversationId: global });
  expect((await typingRows(t)).map((r) => r.clerkId)).toEqual(["bob"]);
  // Stopping when there is nothing to stop is fine.
  await alice.mutation(api.chat.typing.stop, { conversationId: global });
  expect((await typingRows(t)).map((r) => r.clerkId)).toEqual(["bob"]);

  // A send clears the dots in the same transaction as the words.
  const rl = makeConvexTest({ rateLimited: true });
  const pair = await seedChatPair(rl);
  await pair.bob.mutation(api.chat.typing.start, {
    conversationId: pair.global,
  });
  expect(await typingRows(rl)).toHaveLength(1);
  await pair.bob.mutation(api.chat.messages.send, {
    conversationId: pair.global,
    body: "Done typing",
  });
  expect(await typingRows(rl)).toEqual([]);
});

test("typing.who excludes the caller, expired rows and blocked people, and reports time left", async () => {
  const { t, alice, bob, carol, dave, global } = await setup();
  const t0 = Date.now();
  await bob.mutation(api.chat.typing.start, { conversationId: global });
  vi.setSystemTime(t0 + 5_000);
  await carol.mutation(api.chat.typing.start, { conversationId: global });
  await alice.mutation(api.chat.typing.start, { conversationId: global });

  vi.setSystemTime(t0 + 6_000);
  const seen = await alice.query(api.chat.typing.who, {
    conversationId: global,
  });
  // Freshest first, caller left out.
  expect(seen?.map((row) => [row.clerkId, row.handle, row.left])).toEqual([
    ["carol", "carol", 5_000 + TYPING_WINDOW_MS - 6_000],
    ["bob", "bob", TYPING_WINDOW_MS - 6_000],
  ]);

  // Bob's row lapses at t0 + 8s and nobody had to write anything.
  vi.setSystemTime(t0 + TYPING_WINDOW_MS);
  expect(
    (
      await alice.query(api.chat.typing.who, { conversationId: global })
    )?.map((row) => row.clerkId),
  ).toEqual(["carol"]);

  // Blocking carol hides her dots from alice alone.
  await alice.mutation(api.chat.blocks.block, { peerClerkId: "carol" });
  expect(
    await alice.query(api.chat.typing.who, { conversationId: global }),
  ).toEqual([]);
  expect(
    (await bob.query(api.chat.typing.who, { conversationId: global }))
      ?.map((row) => row.clerkId)
      .sort(),
  ).toEqual(["alice", "carol"]);

  // Not a member: null, not an empty list.
  expect(
    await dave.query(api.chat.typing.who, { conversationId: global }),
  ).toBeNull();
  expect(
    await t.query(api.chat.typing.who, { conversationId: global }),
  ).toBeNull();
});

test("presence.here writes for group rooms only, and refreshes a row once it is stale", async () => {
  const { t, alice, dm, global } = await setup();
  const t0 = Date.now();
  await alice.mutation(api.chat.presence.here, { conversationId: dm });
  expect(await presenceRows(t)).toEqual([]);

  await alice.mutation(api.chat.presence.here, { conversationId: global });
  let rows = await presenceRows(t);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    conversationId: global,
    clerkId: "alice",
    lastSeenAt: t0,
  });

  // A beat at fifteen seconds is a read: the row is not touched.
  vi.setSystemTime(t0 + 15_000);
  await alice.mutation(api.chat.presence.here, { conversationId: global });
  rows = await presenceRows(t);
  expect(rows).toHaveLength(1);
  expect(rows[0].lastSeenAt).toBe(t0);

  // At thirty it is rewritten.
  vi.setSystemTime(t0 + 30_000);
  await alice.mutation(api.chat.presence.here, { conversationId: global });
  rows = await presenceRows(t);
  expect(rows).toHaveLength(1);
  expect(rows[0].lastSeenAt).toBe(t0 + 30_000);
});

test("presence.here is silent for signed-out callers, strangers and non-members", async () => {
  const { t, dave, global } = await setup();
  await t.mutation(api.chat.presence.here, { conversationId: global });
  await actor(t, "ghost").mutation(api.chat.presence.here, {
    conversationId: global,
  });
  await dave.mutation(api.chat.presence.here, { conversationId: global });
  expect(await presenceRows(t)).toEqual([]);
  expect(
    await dave.query(api.chat.presence.count, { conversationId: global }),
  ).toBeNull();
  expect(
    await t.query(api.chat.presence.count, { conversationId: global }),
  ).toBeNull();
});

test("presence.count floors at one, drops rows past PRESENCE_WINDOW_MS, and gone deletes", async () => {
  const { t, alice, bob, carol, global } = await setup();
  const t0 = Date.now();
  // Nobody has beaten yet, but the caller is in the room by definition.
  expect(
    await alice.query(api.chat.presence.count, { conversationId: global }),
  ).toEqual({ present: 1, capped: false });

  await alice.mutation(api.chat.presence.here, { conversationId: global });
  await bob.mutation(api.chat.presence.here, { conversationId: global });
  vi.setSystemTime(t0 + 20_000);
  await carol.mutation(api.chat.presence.here, { conversationId: global });
  expect(
    await alice.query(api.chat.presence.count, { conversationId: global }),
  ).toEqual({ present: 3, capped: false });

  // Alice and bob's beats are exactly at the edge of the window: `gt` on
  // `lastSeenAt` means a row exactly PRESENCE_WINDOW_MS old no longer counts.
  vi.setSystemTime(t0 + PRESENCE_WINDOW_MS);
  expect(
    await alice.query(api.chat.presence.count, { conversationId: global }),
  ).toEqual({ present: 1, capped: false });
  vi.setSystemTime(t0 + PRESENCE_WINDOW_MS - 1);
  expect(
    await alice.query(api.chat.presence.count, { conversationId: global }),
  ).toEqual({ present: 3, capped: false });

  // Walking out removes the row for real, even with no membership check.
  await carol.mutation(api.chat.presence.gone, { conversationId: global });
  expect((await presenceRows(t)).map((r) => r.clerkId).sort()).toEqual([
    "alice",
    "bob",
  ]);
  await carol.mutation(api.chat.presence.gone, { conversationId: global });
  expect(await presenceRows(t)).toHaveLength(2);
  expect(
    await alice.query(api.chat.presence.count, { conversationId: global }),
  ).toEqual({ present: 2, capped: false });
});
