/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const room = await t.run(async (ctx) => {
    for (const clerkId of ["alice", "bob", "eve"]) {
      await ctx.db.insert("users", {
        clerkId,
        username: clerkId,
        usernameKey: clerkId,
        clerkCreatedAt: 0,
      });
      await ctx.db.insert("chatSenders", {
        clerkId,
        messagesSent: 100,
        recent: [],
      });
    }
    const conversationId = await ctx.db.insert("conversations", {
      kind: "group",
      title: "Study group",
      createdBy: "alice",
      createdAt: Date.now(),
    });
    for (const clerkId of ["alice", "bob"])
      await ctx.db.insert("conversationMembers", {
        conversationId,
        clerkId,
        kind: "group",
        role: "member",
        status: "active",
        joinedAt: 0,
        lastReadAt: 0,
      });
    return conversationId;
  });
  return {
    t,
    room,
    alice: t.withIdentity({ subject: "alice" }),
    bob: t.withIdentity({ subject: "bob" }),
    eve: t.withIdentity({ subject: "eve" }),
  };
}

test("retry nonce is scoped to the authenticated author and never duplicates a committed send", async () => {
  const { t, room, alice, bob } = await setup();
  const args = {
    conversationId: room,
    body: "Ready for our meeting",
    clientNonce: "retry-1",
  };
  expect(await alice.mutation(api.chat.messages.send, args)).toEqual({
    ok: true,
  });
  expect(await alice.mutation(api.chat.messages.send, args)).toEqual({
    ok: true,
  });
  expect(await t.run((ctx) => ctx.db.query("messages").take(10))).toHaveLength(
    1,
  );
  expect(await bob.mutation(api.chat.messages.send, args)).toEqual({
    ok: true,
  });
  expect(await t.run((ctx) => ctx.db.query("messages").take(10))).toHaveLength(
    2,
  );
  const sender = await t.run((ctx) =>
    ctx.db
      .query("chatSenders")
      .withIndex("byClerkId", (q) => q.eq("clerkId", "alice"))
      .unique(),
  );
  expect(sender?.messagesSent).toBe(101);
});

test("room faces name active readers and DM status follows app activity", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
  const { room, alice, bob, eve } = await setup();
  expect(
    await alice.query(api.chat.presence.count, { conversationId: room }),
  ).toMatchObject({
    present: 1,
    people: [{ clerkId: "alice", handle: "alice" }],
  });
  await bob.mutation(api.chat.presence.here, { conversationId: room });
  const roomPresence = await alice.query(api.chat.presence.count, {
    conversationId: room,
  });
  expect(roomPresence?.people.map((person) => person.handle)).toEqual([
    "alice",
    "bob",
  ]);
  expect(roomPresence?.present).toBe(2);
  expect(
    await eve.query(api.chat.presence.count, { conversationId: room }),
  ).toBeNull();

  const opened = await alice.mutation(api.chat.conversations.openDm, {
    peerClerkId: "bob",
  });
  if (!opened.ok) throw new Error("DM did not open");
  const args = { conversationId: opened.conversationId };
  expect(await alice.query(api.chat.presence.peerStatus, args)).toBe(0);
  await bob.mutation(api.users.heartbeat, { path: "/home" });
  expect(await alice.query(api.chat.presence.peerStatus, args)).toBe(
    Date.now() + 60_000,
  );
  expect(await eve.query(api.chat.presence.peerStatus, args)).toBeNull();
  vi.setSystemTime(Date.now() + 60_001);
  expect(
    (await alice.query(api.chat.presence.peerStatus, args))! < Date.now(),
  ).toBe(true);
});

test("offline send identity and immutable retry metadata reject changed requests", async () => {
  const { t, room, alice, bob } = await setup();
  const args = {
    conversationId: room,
    body: "Ready for the meeting",
    clientNonce: "original-request",
    expectedAuthorClerkId: "alice",
  };
  expect(await bob.mutation(api.chat.messages.send, args)).toEqual({
    ok: false,
    refusal: "not-a-member",
  });
  expect(await alice.mutation(api.chat.messages.send, args)).toEqual({
    ok: true,
  });
  expect(
    await alice.mutation(api.chat.messages.send, {
      ...args,
      body: "Different message",
    }),
  ).toEqual({ ok: false, refusal: "duplicate" });
  expect(
    await alice.mutation(api.chat.messages.send, {
      ...args,
      poll: { options: ["Monday", "Tuesday"] },
    }),
  ).toEqual({ ok: false, refusal: "duplicate" });
  const message = (await t.run((ctx) => ctx.db.query("messages").first()))!;
  expect(
    await alice.mutation(api.chat.messages.send, {
      ...args,
      replyToId: message._id,
    }),
  ).toEqual({ ok: false, refusal: "duplicate" });
  const other = await alice.mutation(api.chat.conversations.createGroup, {
    title: "Other group",
    joinPolicy: "invite",
  });
  if (!other.ok) throw new Error("Could not create test group");
  expect(
    await alice.mutation(api.chat.messages.send, {
      ...args,
      conversationId: other.conversationId,
    }),
  ).toEqual({ ok: false, refusal: "duplicate" });
  expect(
    await alice.mutation(api.chat.messages.edit, {
      messageId: message._id,
      body: "Ready for tomorrow",
    }),
  ).toEqual({ ok: true });
  expect(await alice.mutation(api.chat.messages.send, args)).toEqual({
    ok: true,
  });
  expect(await t.run((ctx) => ctx.db.query("messages").take(10))).toHaveLength(
    1,
  );
});

test("edits require ownership, membership and the edit window, rerun moderation and preserve replies", async () => {
  vi.useFakeTimers();
  const { t, room, alice, bob, eve } = await setup();
  const original = await t.run((ctx) =>
    ctx.db.insert("messages", {
      conversationId: room,
      authorClerkId: "bob",
      authorHandle: "bob",
      body: "Which chapter",
      status: "visible",
      flags: [],
    }),
  );
  expect(
    await alice.mutation(api.chat.messages.send, {
      conversationId: room,
      body: "Chapter four",
      replyToId: original,
    }),
  ).toEqual({ ok: true });
  const message = (await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("byConversation", (q) => q.eq("conversationId", room))
      .order("desc")
      .first(),
  ))!;
  expect(
    await bob.mutation(api.chat.messages.edit, {
      messageId: message._id,
      body: "Other text",
    }),
  ).toEqual({ ok: false, refusal: "read-only" });
  expect(
    await eve.mutation(api.chat.messages.edit, {
      messageId: message._id,
      body: "Other text",
    }),
  ).toEqual({ ok: false, refusal: "read-only" });
  expect(
    await alice.mutation(api.chat.messages.edit, {
      messageId: message._id,
      body: "call me at 555-123-4567",
    }),
  ).toMatchObject({ ok: false });
  expect(
    await alice.mutation(api.chat.messages.edit, {
      messageId: message._id,
      body: "Chapter five @bob",
    }),
  ).toEqual({ ok: true });
  const edited = await t.run((ctx) => ctx.db.get(message._id));
  expect(edited).toMatchObject({
    body: "Chapter five @bob",
    replyToId: original,
    editedAt: Date.now(),
    mentions: [{ clerkId: "bob", handle: "bob" }],
  });
  vi.advanceTimersByTime(15 * 60_000 + 1);
  expect(
    await alice.mutation(api.chat.messages.edit, {
      messageId: message._id,
      body: "Chapter six",
    }),
  ).toEqual({ ok: false, refusal: "read-only" });
});

test("poll choices are moderated, one vote per member can change or clear, and identities stay private", async () => {
  const { t, room, alice, bob, eve } = await setup();
  const args = {
    conversationId: room,
    body: "Which day works",
    poll: { options: ["Monday", "Tuesday"] },
  };
  expect(
    await alice.mutation(api.chat.messages.send, {
      ...args,
      poll: { options: ["Monday", "monday"] },
    }),
  ).toEqual({ ok: false, refusal: "duplicate" });
  expect(
    await alice.mutation(api.chat.messages.send, {
      ...args,
      poll: { options: ["Monday", "call me at 555-123-4567"] },
    }),
  ).toMatchObject({ ok: false });
  expect(await alice.mutation(api.chat.messages.send, args)).toEqual({
    ok: true,
  });
  const message = (await t.run((ctx) => ctx.db.query("messages").first()))!;
  expect(
    await eve.mutation(api.chat.messages.vote, {
      messageId: message._id,
      option: 0,
    }),
  ).toEqual({ ok: false });
  expect(
    await bob.mutation(api.chat.messages.vote, {
      messageId: message._id,
      option: 0.5,
    }),
  ).toEqual({ ok: false });
  expect(
    await bob.mutation(api.chat.messages.vote, {
      messageId: message._id,
      option: 0,
    }),
  ).toEqual({ ok: true });
  expect(
    await bob.mutation(api.chat.messages.vote, {
      messageId: message._id,
      option: 1,
    }),
  ).toEqual({ ok: true });
  const context = await alice.query(api.chat.messages.context, {
    messageId: message._id,
  });
  expect(context?.messages[0].poll).toEqual({
    options: [
      { text: "Monday", votes: 0 },
      { text: "Tuesday", votes: 1 },
    ],
    myVote: null,
    totalVotes: 1,
  });
  expect(
    await alice.mutation(api.chat.messages.edit, {
      messageId: message._id,
      body: "Changed question",
    }),
  ).toEqual({ ok: false, refusal: "read-only" });
  expect(
    await bob.mutation(api.chat.messages.vote, {
      messageId: message._id,
      option: 1,
    }),
  ).toEqual({ ok: true });
  expect(
    (await bob.query(api.chat.messages.context, { messageId: message._id }))
      ?.messages[0].poll?.totalVotes,
  ).toBe(0);
});

test("exact context reaches old messages without leaking inaccessible rooms", async () => {
  const { t, room, alice, eve } = await setup();
  const ids = await t.run(async (ctx) => {
    const ids = [];
    for (let index = 0; index < 65; index++)
      ids.push(
        await ctx.db.insert("messages", {
          conversationId: room,
          authorClerkId: index % 2 ? "alice" : "bob",
          authorHandle: index % 2 ? "alice" : "bob",
          body: `Chapter ${index}`,
          status: "visible",
          flags: [],
        }),
      );
    return ids;
  });
  const context = await alice.query(api.chat.messages.context, {
    messageId: ids[20],
  });
  expect(context?.messages.map((message) => message._id)).toContain(ids[20]);
  expect(context?.messages).toHaveLength(41);
  expect(
    await eve.query(api.chat.messages.context, { messageId: ids[20] }),
  ).toBeNull();
  expect(
    await alice.query(api.chat.messages.context, { messageId: "invalid-id" }),
  ).toBeNull();
});

test("favorites are private; marking unread restores the actual first unread position", async () => {
  vi.useFakeTimers();
  const { t, room, alice, bob, eve } = await setup();
  expect(
    await alice.mutation(api.chat.conversations.setFavorite, {
      conversationId: room,
      favorite: true,
    }),
  ).toBe(true);
  expect((await alice.query(api.chat.conversations.list, {}))[0].favorite).toBe(
    true,
  );
  expect((await bob.query(api.chat.conversations.list, {}))[0].favorite).toBe(
    false,
  );
  expect(
    await eve.mutation(api.chat.conversations.setFavorite, {
      conversationId: room,
      favorite: true,
    }),
  ).toBe(false);
  const id = await t.run((ctx) =>
    ctx.db.insert("messages", {
      conversationId: room,
      authorClerkId: "bob",
      authorHandle: "bob",
      body: "See you tomorrow",
      status: "visible",
      flags: [],
    }),
  );
  await alice.mutation(api.chat.conversations.markRead, {
    conversationId: room,
  });
  expect(
    (
      await alice.query(api.chat.conversations.readPosition, {
        conversationId: room,
      })
    )?.firstUnreadId,
  ).toBeNull();
  expect(
    await alice.mutation(api.chat.conversations.markUnread, {
      conversationId: room,
    }),
  ).toBe(true);
  expect(
    (
      await alice.query(api.chat.conversations.readPosition, {
        conversationId: room,
      })
    )?.firstUnreadId,
  ).toBe(id);
  expect((await alice.query(api.chat.conversations.list, {}))[0]).toMatchObject(
    {
      unread: 1,
      firstUnreadMessageId: id,
      latestMessage: { _id: id, authorClerkId: "bob" },
    },
  );
  expect(
    await eve.query(api.chat.conversations.readPosition, {
      conversationId: room,
    }),
  ).toBeNull();
});

test("historical context never reveals a hidden or deleted target or hidden neighbor contents", async () => {
  const { t, room, alice } = await setup();
  const ids = await t.run(async (ctx) => {
    const base = {
      conversationId: room,
      authorClerkId: "bob",
      authorHandle: "bob",
      flags: [],
    };
    const hidden = await ctx.db.insert("messages", {
      ...base,
      body: "Private hidden content",
      status: "hidden",
    });
    const visible = await ctx.db.insert("messages", {
      ...base,
      body: "Public content",
      status: "visible",
    });
    return { hidden, visible };
  });
  expect(
    await alice.query(api.chat.messages.context, { messageId: ids.hidden }),
  ).toBeNull();
  const context = await alice.query(api.chat.messages.context, {
    messageId: ids.visible,
  });
  expect(context?.messages.find((row) => row._id === ids.hidden)).toMatchObject(
    { body: "", status: "hidden", images: [], reactions: [], mentions: [] },
  );
  await t.run((ctx) => ctx.db.delete(ids.visible));
  expect(
    await alice.query(api.chat.messages.context, { messageId: ids.visible }),
  ).toBeNull();
});

test("same-millisecond sends can be marked read, unread and read again using the exact message timestamp", async () => {
  vi.useFakeTimers();
  const { t, room, alice, bob } = await setup();
  expect(
    await bob.mutation(api.chat.messages.send, {
      conversationId: room,
      body: "A new message to read",
    }),
  ).toEqual({ ok: true });
  const message = (await t.run((ctx) => ctx.db.query("messages").first()))!;
  expect(message._creationTime).toBeGreaterThan(Date.now());
  expect((await t.run((ctx) => ctx.db.get(room)))?.lastMessageAt).toBe(
    Date.now(),
  );
  expect((await alice.query(api.chat.conversations.list, {}))[0].unread).toBe(
    1,
  );
  await alice.mutation(api.chat.conversations.markRead, {
    conversationId: room,
  });
  expect((await alice.query(api.chat.conversations.list, {}))[0].unread).toBe(
    0,
  );
  expect(
    (
      await alice.query(api.chat.conversations.readPosition, {
        conversationId: room,
      })
    )?.firstUnreadId,
  ).toBeNull();
  await alice.mutation(api.chat.conversations.markUnread, {
    conversationId: room,
  });
  const unread = (await alice.query(api.chat.conversations.list, {}))[0];
  expect(unread.lastReadAt).toBeGreaterThan(Date.now());
  expect(unread).toMatchObject({
    unread: 1,
    firstUnreadMessageId: message._id,
  });
  await alice.mutation(api.chat.conversations.markRead, {
    conversationId: room,
  });
  expect((await alice.query(api.chat.conversations.list, {}))[0].unread).toBe(
    0,
  );
});
