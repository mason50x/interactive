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
      ctx.db.insert("chatProfiles", {
        clerkId: name,
        handle: name,
        handleKey: name,
        createdAt: 0,
        messagesSent: 100,
      }),
    );
    await t
      .withIdentity({ subject: name })
      .mutation(api.chat.profiles.joinGlobal, {});
  }
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  const list = await alice.query(api.chat.conversations.list, {});
  return { t, alice, bob, global: list[0]._id, dm: list[1]._id };
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
