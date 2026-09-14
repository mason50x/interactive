import { afterEach, expect, test, vi } from "vitest";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  DELETE_WINDOW_MS,
  MAX_REACTION_KINDS,
  MAX_REACTORS,
  REACTIONS,
} from "@convex/moderation/limits";
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

/** A visible message inserted directly, so no rate window is spent on it. */
async function post(
  t: ConvexHarness,
  conversationId: Id<"conversations">,
  author: string,
  body: string,
  extra: Partial<{
    status: "visible" | "hidden";
    reactions: { emoji: string; by: string[] }[];
  }> = {},
): Promise<Id<"messages">> {
  return await t.run((ctx) =>
    ctx.db.insert("messages", {
      conversationId,
      authorClerkId: author,
      authorHandle: author,
      body,
      status: extra.status ?? "visible",
      flags: [],
      reactions: extra.reactions,
    }),
  );
}

async function reactionsOf(t: ConvexHarness, messageId: Id<"messages">) {
  return (await t.run((ctx) => ctx.db.get(messageId)))?.reactions;
}

afterEach(() => {
  vi.useRealTimers();
});

test("react toggles one of the fixed emoji on and off, and refuses anything else", async () => {
  const { t, alice, bob, global } = await setup();
  const messageId = await post(t, global, "alice", "Hello there");

  await bob.mutation(api.chat.messages.react, { messageId, emoji: "👍" });
  expect(await reactionsOf(t, messageId)).toEqual([
    { emoji: "👍", by: ["bob"] },
  ]);

  // A second person joins the same pill; the first sees `mine` from their side.
  await alice.mutation(api.chat.messages.react, { messageId, emoji: "👍" });
  const list = await alice.query(api.chat.messages.list, {
    conversationId: global,
    dayStart: 0,
    dayEnd: Number.MAX_SAFE_INTEGER,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(list.page[0].reactions).toEqual([
    { emoji: "👍", count: 2, mine: true },
  ]);

  // Pressing it again takes it back, and an emptied pill is not drawn.
  await bob.mutation(api.chat.messages.react, { messageId, emoji: "👍" });
  await alice.mutation(api.chat.messages.react, { messageId, emoji: "👍" });
  expect(await reactionsOf(t, messageId)).toEqual([{ emoji: "👍", by: [] }]);
  expect(
    (
      await alice.query(api.chat.messages.list, {
        conversationId: global,
        dayStart: 0,
        dayEnd: Number.MAX_SAFE_INTEGER,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page[0].reactions,
  ).toEqual([]);

  // Not in the set: nothing is written.
  await bob.mutation(api.chat.messages.react, { messageId, emoji: "🍕" });
  expect(await reactionsOf(t, messageId)).toEqual([{ emoji: "👍", by: [] }]);
});

test("react is refused to non-members and on hidden messages", async () => {
  const { t, alice, global } = await setup();
  await seedChatProfiles(t, ["carol"]);
  const carol = actor(t, "carol");
  const messageId = await post(t, global, "alice", "Hello there");

  // Carol has a profile and no seat in the room.
  await carol.mutation(api.chat.messages.react, { messageId, emoji: "❤️" });
  expect(await reactionsOf(t, messageId)).toBeUndefined();

  // Somebody without a profile at all.
  await actor(t, "nobody").mutation(api.chat.messages.react, {
    messageId,
    emoji: "❤️",
  });
  expect(await reactionsOf(t, messageId)).toBeUndefined();

  const hidden = await post(t, global, "alice", "Reported away", {
    status: "hidden",
  });
  await alice.mutation(api.chat.messages.react, {
    messageId: hidden,
    emoji: "❤️",
  });
  expect(await reactionsOf(t, hidden)).toBeUndefined();
});

test("react respects the caps on distinct kinds and on recorded reactors", async () => {
  const { t, alice, bob, global } = await setup();

  // Every kind already taken: a new one is refused, an existing one still moves.
  const crowded = await post(t, global, "alice", "Popular", {
    reactions: Array.from({ length: MAX_REACTION_KINDS }, (_, index) => ({
      emoji: index === 0 ? "😂" : `kind-${index}`,
      by: ["carol"],
    })),
  });
  await bob.mutation(api.chat.messages.react, {
    messageId: crowded,
    emoji: "👍",
  });
  expect(await reactionsOf(t, crowded)).toHaveLength(MAX_REACTION_KINDS);
  expect(
    (await reactionsOf(t, crowded))?.find((entry) => entry.emoji === "👍"),
  ).toBeUndefined();
  await bob.mutation(api.chat.messages.react, {
    messageId: crowded,
    emoji: "😂",
  });
  expect(
    (await reactionsOf(t, crowded))?.find((entry) => entry.emoji === "😂")?.by,
  ).toEqual(["carol", "bob"]);

  // A full pill: the list of who stops growing, but somebody on it can leave.
  const full = await post(t, global, "alice", "Very popular", {
    reactions: [
      {
        emoji: "🔥",
        by: Array.from({ length: MAX_REACTORS }, (_, index) =>
          index === 0 ? "bob" : `fan-${index}`,
        ),
      },
    ],
  });
  await alice.mutation(api.chat.messages.react, {
    messageId: full,
    emoji: "🔥",
  });
  let by = (await reactionsOf(t, full))![0].by;
  expect(by).toHaveLength(MAX_REACTORS);
  expect(by).not.toContain("alice");
  await bob.mutation(api.chat.messages.react, { messageId: full, emoji: "🔥" });
  by = (await reactionsOf(t, full))![0].by;
  expect(by).toHaveLength(MAX_REACTORS - 1);
  expect(by).not.toContain("bob");
});

test("reactors names who pressed an emoji, hiding blocked accounts and non-members", async () => {
  const { t, alice, bob, global } = await setup();
  await seedChatProfiles(t, ["carol", "dave"]);
  await t.run(async (ctx) => {
    const carol = await ctx.db
      .query("chatProfiles")
      .withIndex("byClerkId", (q) => q.eq("clerkId", "carol"))
      .unique();
    await ctx.db.patch(carol!._id, { displayName: "Carol C" });
    await ctx.db.insert("blocks", {
      blocker: "alice",
      blocked: "dave",
      createdAt: Date.now(),
    });
  });
  const messageId = await post(t, global, "alice", "Hello there", {
    reactions: [
      { emoji: "❤️", by: ["bob", "carol", "dave", "ghost"] },
      { emoji: "👍", by: ["bob"] },
    ],
  });

  // Dave is blocked by alice; ghost has no profile to name.
  expect(
    await alice.query(api.chat.messages.reactors, { messageId, emoji: "❤️" }),
  ).toEqual([
    { clerkId: "bob", handle: "bob", displayName: undefined },
    { clerkId: "carol", handle: "carol", displayName: "Carol C" },
  ]);
  // Bob has blocked nobody, so he sees dave too.
  expect(
    (
      await bob.query(api.chat.messages.reactors, { messageId, emoji: "❤️" })
    ).map((person) => person.clerkId),
  ).toEqual(["bob", "carol", "dave"]);

  expect(
    await alice.query(api.chat.messages.reactors, { messageId, emoji: "😂" }),
  ).toEqual([]);
  expect(
    await alice.query(api.chat.messages.reactors, { messageId, emoji: "🍕" }),
  ).toEqual([]);
  // Carol is not in the room, so she is told nothing.
  expect(
    await actor(t, "carol").query(api.chat.messages.reactors, {
      messageId,
      emoji: "❤️",
    }),
  ).toEqual([]);
});

test("remove deletes the author's own message, with its mention rows, inside the window", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  const { t, alice, bob, global } = await setup();

  expect(
    await alice.mutation(api.chat.messages.send, {
      conversationId: global,
      body: "@bob come look at this",
    }),
  ).toEqual({ ok: true });
  const message = (await t.run((ctx) => ctx.db.query("messages").take(5)))[0];
  expect(
    await t.run((ctx) => ctx.db.query("mentions").take(5)),
  ).toHaveLength(1);
  expect(
    (await bob.query(api.chat.conversations.list, {}))[0],
  ).toMatchObject({ unread: 1, mentioned: true });

  // Not bob's to take back.
  await bob.mutation(api.chat.messages.remove, { messageId: message._id });
  expect(await t.run((ctx) => ctx.db.get(message._id))).not.toBeNull();

  vi.setSystemTime(Date.now() + DELETE_WINDOW_MS - 1_000);
  await alice.mutation(api.chat.messages.remove, { messageId: message._id });
  expect(await t.run((ctx) => ctx.db.get(message._id))).toBeNull();
  expect(await t.run((ctx) => ctx.db.query("mentions").take(5))).toEqual([]);
  expect(
    (await bob.query(api.chat.conversations.list, {}))[0],
  ).toMatchObject({ unread: 0, mentioned: false });
});

test("remove refuses once the delete window has closed", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  const { t, alice, global } = await setup();
  const messageId = await post(t, global, "alice", "Said and done");

  vi.setSystemTime(Date.now() + DELETE_WINDOW_MS + 1);
  await alice.mutation(api.chat.messages.remove, { messageId });
  expect(await t.run((ctx) => ctx.db.get(messageId))).not.toBeNull();

  // Removing something that is already gone is not an error.
  await t.run((ctx) => ctx.db.delete(messageId));
  await alice.mutation(api.chat.messages.remove, { messageId });
});

test("search returns only what the caller may read, in the palette's shape", async () => {
  const { t, alice, bob, global, dm } = await setup();
  await seedChatProfiles(t, ["carol"]);
  await t.run((ctx) =>
    ctx.db.insert("blocks", {
      blocker: "alice",
      blocked: "carol",
      createdAt: Date.now(),
    }),
  );

  // A group alice was once in and has left, and one bob keeps to himself.
  const left = await bob.mutation(api.chat.conversations.createGroup, {
    title: "Old crew",
    joinPolicy: "invite",
  });
  const secret = await bob.mutation(api.chat.conversations.createGroup, {
    title: "Secret crew",
    joinPolicy: "invite",
  });
  if (!left.ok || !secret.ok) throw new Error("group not created");
  await t.run((ctx) =>
    ctx.db.insert("conversationMembers", {
      conversationId: left.conversationId,
      clerkId: "alice",
      kind: "group",
      role: "member",
      status: "left",
      joinedAt: 0,
      lastReadAt: 0,
    }),
  );
  const ours = await alice.mutation(api.chat.conversations.createGroup, {
    title: "Pineapple club",
    joinPolicy: "open",
  });
  if (!ours.ok) throw new Error("group not created");

  const visible = await post(t, global, "bob", "Pineapple on pizza is fine");
  await post(t, global, "carol", "Pineapple from a blocked account");
  await post(t, global, "alice", "Pineapple nobody should find", {
    status: "hidden",
  });
  await post(t, left.conversationId, "bob", "Pineapple in a group she left");
  await post(t, secret.conversationId, "bob", "Pineapple in a private group");
  const grouped = await post(t, ours.conversationId, "alice", "Pineapple day");
  const direct = await post(t, dm, "bot", "Pineapple is a fruit");
  await post(t, global, "bob", "Nothing to see here");

  const hits = await alice.query(api.chat.messages.search, {
    text: "  pineapple ",
  });
  expect(hits.map((hit) => hit._id).sort()).toEqual(
    [visible, grouped, direct].sort(),
  );
  expect(hits.find((hit) => hit._id === visible)).toEqual({
    _id: visible,
    _creationTime: expect.any(Number),
    conversationId: global,
    kind: "global",
    authorHandle: "bob",
    body: "Pineapple on pizza is fine",
  });
  expect(hits.find((hit) => hit._id === grouped)).toMatchObject({
    kind: "group",
    title: "Pineapple club",
    authorHandle: "alice",
  });
  expect(hits.find((hit) => hit._id === direct)).toMatchObject({
    kind: "dm",
    peerHandle: "bot",
    authorHandle: "bot",
  });

  // Bob blocks nobody and is in both his groups; alice's DM is not his.
  expect(
    (await bob.query(api.chat.messages.search, { text: "pineapple" })).length,
  ).toBe(4);

  expect(await alice.query(api.chat.messages.search, { text: "" })).toEqual([]);
  expect(await alice.query(api.chat.messages.search, { text: "   " })).toEqual(
    [],
  );
  expect(
    await actor(t, "nobody").query(api.chat.messages.search, {
      text: "pineapple",
    }),
  ).toEqual([]);
});

test("list pages newest first, continues from the cursor, and drops blocked authors", async () => {
  const { t, alice, global } = await setup();
  await seedChatProfiles(t, ["carol"]);
  for (let index = 0; index < 5; index++) {
    await post(t, global, index === 2 ? "carol" : "bob", `Message ${index}`);
  }
  await t.run((ctx) =>
    ctx.db.insert("blocks", {
      blocker: "alice",
      blocked: "carol",
      createdAt: Date.now(),
    }),
  );

  const args = {
    conversationId: global,
    dayStart: 0,
    dayEnd: Number.MAX_SAFE_INTEGER,
  };
  const first = await alice.query(api.chat.messages.list, {
    ...args,
    paginationOpts: { numItems: 2, cursor: null },
  });
  expect(first.page.map((message) => message.body)).toEqual([
    "Message 4",
    "Message 3",
  ]);
  expect(first.isDone).toBe(false);

  // The blocked author's row is dropped from the page rather than replaced,
  // so this page comes back short.
  const second = await alice.query(api.chat.messages.list, {
    ...args,
    paginationOpts: { numItems: 2, cursor: first.continueCursor },
  });
  expect(second.page.map((message) => message.body)).toEqual(["Message 1"]);
  expect(second.isDone).toBe(false);

  const third = await alice.query(api.chat.messages.list, {
    ...args,
    paginationOpts: { numItems: 2, cursor: second.continueCursor },
  });
  expect(third.page.map((message) => message.body)).toEqual(["Message 0"]);
  expect(third.isDone).toBe(true);

  // A day window that holds nothing.
  expect(
    (
      await alice.query(api.chat.messages.list, {
        conversationId: global,
        dayStart: 0,
        dayEnd: 1,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page,
  ).toEqual([]);
});

test("every reaction in the fixed set is accepted", async () => {
  const { t, bob, global } = await setup();
  const messageId = await post(t, global, "alice", "All of them");
  for (const emoji of REACTIONS) {
    await bob.mutation(api.chat.messages.react, { messageId, emoji });
  }
  expect((await reactionsOf(t, messageId))?.map((entry) => entry.emoji)).toEqual(
    [...REACTIONS],
  );
});
