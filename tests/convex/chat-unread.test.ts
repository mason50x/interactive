import { expect, test, vi } from "vitest";
import { api } from "@convex/_generated/api";
import { makeConvexTest, seedChatPair } from "../helpers/convex";

async function setup() {
  const t = makeConvexTest({ rateLimited: true });
  return { t, ...(await seedChatPair(t)) };
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
