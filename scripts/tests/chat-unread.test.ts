/// <reference types="vite/client" />
import { expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
const modules = import.meta.glob("../../convex/**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  for (const name of ["alice", "bob"]) {
    await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: name,
        username: name,
        usernameKey: name,
        clerkCreatedAt: 0,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("chatSenders", {
        clerkId: name,
        messagesSent: 100,
        recent: [],
      }),
    );
    await t
      .withIdentity({ subject: name })
      .mutation(api.chat.accounts.joinGlobal, {});
  }
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  const list = await alice.query(api.chat.conversations.list, {});
  return {
    t,
    alice,
    bob,
    global: list[0]._id,
    dm: list.find((row) => row.kind === "dm")!._id,
  };
}

// The clock is held still on purpose: a message is then stamped a fraction of
// a millisecond after the `Date.now()` the mutation read, which is exactly
// what happens on a real deployment. A reading position written from that
// `now` sits before the message it was meant to cover.
test("sending does not leave the sender's own message unread", async () => {
  vi.useFakeTimers();
  try {
    const { alice, bob, global, dm } = await setup();
    for (const [conversationId, body] of [
      [global, "Hello there"],
      [dm, "Hello old man"],
    ] as const) {
      const result = await alice.mutation(api.chat.messages.send, {
        conversationId,
        body,
      });
      expect(result).toEqual({ ok: true });
    }

    const mine = await alice.query(api.chat.conversations.list, {});
    expect(mine.map((row) => [row.kind, row.unread, row.mentioned])).toEqual([
      ["global", 0, false],
      ["announcements", 0, false],
      ["dm", 0, false],
    ]);

    // The other side of the room still sees it, and its mention.
    await alice.mutation(api.chat.messages.send, {
      conversationId: global,
      body: "@bob are you there",
    });
    const theirs = await bob.query(api.chat.conversations.list, {});
    expect(theirs[0]).toMatchObject({
      kind: "global",
      unread: 1,
      mentioned: true,
    });
    expect(
      (await alice.query(api.chat.conversations.list, {}))[0],
    ).toMatchObject({ unread: 0, mentioned: false });
  } finally {
    vi.useRealTimers();
  }
});

test("automatic reading covers only the displayed message", async () => {
  const { t, alice, bob, global } = await setup();
  await bob.mutation(api.chat.messages.send, {
    conversationId: global,
    body: "First message",
  });
  const first = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("byConversation", (q) => q.eq("conversationId", global))
      .order("desc")
      .first(),
  );
  await bob.mutation(api.chat.messages.send, {
    conversationId: global,
    body: "Second message",
  });
  await alice.mutation(api.chat.conversations.markRead, {
    conversationId: global,
    throughMessageId: first!._id,
  });
  expect(
    (await alice.query(api.chat.conversations.list, {}))[0].unread,
  ).toBeGreaterThan(0);
  const latest = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("byConversation", (q) => q.eq("conversationId", global))
      .order("desc")
      .first(),
  );
  await alice.mutation(api.chat.conversations.markRead, {
    conversationId: global,
    throughMessageId: latest!._id,
  });
  expect((await alice.query(api.chat.conversations.list, {}))[0].unread).toBe(
    0,
  );
});

test("automatic reading rejects a cursor from another conversation", async () => {
  const { t, alice, bob, global, dm } = await setup();
  await bob.mutation(api.chat.messages.send, {
    conversationId: global,
    body: "Still unread",
  });
  const unrelated = await t.run((ctx) =>
    ctx.db.insert("messages", {
      conversationId: dm,
      authorClerkId: "bot",
      authorHandle: "wizard",
      body: "Hello",
      status: "visible",
      flags: [],
    }),
  );
  await alice.mutation(api.chat.conversations.markRead, {
    conversationId: global,
    throughMessageId: unrelated,
  });
  expect(
    (await alice.query(api.chat.conversations.list, {}))[0].unread,
  ).toBeGreaterThan(0);
});

test("read receipts follow each human DM participant's read position", async () => {
  const { t, alice, bob, global, dm: botDm } = await setup();
  const opened = await alice.mutation(api.chat.conversations.openDm, {
    peerClerkId: "bob",
  });
  expect(opened.ok).toBe(true);
  if (!opened.ok) return;
  const conversationId = opened.conversationId;

  expect(
    await alice.query(api.chat.conversations.peerReadAt, { conversationId }),
  ).toBe(0);
  expect(
    await bob.query(api.chat.conversations.peerReadAt, { conversationId }),
  ).toBe(0);

  await alice.mutation(api.chat.messages.send, {
    conversationId,
    body: "First",
  });
  const first = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("byConversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("desc")
      .first(),
  );
  await bob.mutation(api.chat.conversations.markRead, {
    conversationId,
    throughMessageId: first!._id,
  });
  expect(
    await alice.query(api.chat.conversations.peerReadAt, { conversationId }),
  ).toBeGreaterThanOrEqual(first!._creationTime);

  await bob.mutation(api.chat.messages.send, { conversationId, body: "Reply" });
  const reply = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("byConversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("desc")
      .first(),
  );
  await alice.mutation(api.chat.conversations.markRead, {
    conversationId,
    throughMessageId: reply!._id,
  });
  expect(
    await bob.query(api.chat.conversations.peerReadAt, { conversationId }),
  ).toBeGreaterThanOrEqual(reply!._creationTime);

  expect(
    await alice.query(api.chat.conversations.peerReadAt, {
      conversationId: global,
    }),
  ).toBeNull();
  expect(
    await alice.query(api.chat.conversations.peerReadAt, {
      conversationId: botDm,
    }),
  ).toBeNull();
  const group = await t.run(async (ctx) => {
    const id = await ctx.db.insert("conversations", {
      kind: "group",
      createdBy: "alice",
      createdAt: Date.now(),
      title: "Group",
    });
    await ctx.db.insert("conversationMembers", {
      conversationId: id,
      clerkId: "alice",
      kind: "group",
      role: "member",
      status: "active",
      joinedAt: Date.now(),
      lastReadAt: 0,
    });
    return id;
  });
  expect(
    await alice.query(api.chat.conversations.peerReadAt, {
      conversationId: group,
    }),
  ).toBeNull();
  expect(
    await t
      .withIdentity({ subject: "eve" })
      .query(api.chat.conversations.peerReadAt, { conversationId }),
  ).toBeNull();
});

test("message links locate only visible messages in an accessible conversation", async () => {
  const { t, alice, bob, global, dm } = await setup();
  const id = await t.run((ctx) =>
    ctx.db.insert("messages", {
      conversationId: dm,
      authorClerkId: "alice",
      authorHandle: "alice",
      body: "Private",
      status: "visible",
      flags: [],
    }),
  );
  expect(
    await alice.query(api.chat.messages.location, {
      conversationId: dm,
      messageId: id,
    }),
  ).toEqual({ createdAt: expect.any(Number) });
  expect(
    await bob.query(api.chat.messages.location, {
      conversationId: dm,
      messageId: id,
    }),
  ).toBeNull();
  expect(
    await alice.query(api.chat.messages.location, {
      conversationId: global,
      messageId: id,
    }),
  ).toBeNull();
  expect(
    await alice.query(api.chat.messages.location, {
      conversationId: dm,
      messageId: "invalid",
    }),
  ).toBeNull();
  await t.run((ctx) => ctx.db.patch(id, { status: "hidden" }));
  expect(
    await alice.query(api.chat.messages.location, {
      conversationId: dm,
      messageId: id,
    }),
  ).toBeNull();
});
