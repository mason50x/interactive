import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import type { ChatMessage } from "../../convex/chat/messages";
import { messagesConnect } from "../../src/lib/chat-grouping";

const at = new Date(2026, 8, 22, 12).getTime();
const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  _id: "message" as Id<"messages">,
  _creationTime: at,
  authorClerkId: "alice",
  authorHandle: "alice",
  body: "Hello",
  mentions: [],
  mentionsEveryone: false,
  reactions: [],
  images: [],
  status: "visible",
  ...overrides,
});

describe("connected chat bubbles", () => {
  it("connects a run from one author and breaks on a sender change or pause", () => {
    expect(
      messagesConnect(message(), message({ _creationTime: at + 60_000 })),
    ).toBe(true);
    expect(messagesConnect(message(), message({ authorClerkId: "bob" }))).toBe(
      false,
    );
    expect(
      messagesConnect(message(), message({ _creationTime: at + 300_000 })),
    ).toBe(false);
    expect(messagesConnect(message(), message({ _creationTime: at - 1 }))).toBe(
      false,
    );
    expect(messagesConnect(undefined, message())).toBe(false);
    expect(messagesConnect(message(), undefined)).toBe(false);
  });

  it("does not connect across midnight, removed content, or intervening replies and reactions", () => {
    const midnight = new Date(2026, 8, 23).getTime();
    expect(
      messagesConnect(
        message({ _creationTime: midnight - 1 }),
        message({ _creationTime: midnight }),
      ),
    ).toBe(false);
    expect(messagesConnect(message({ status: "hidden" }), message())).toBe(
      false,
    );
    expect(messagesConnect(message(), message({ status: "hidden" }))).toBe(
      false,
    );
    expect(
      messagesConnect(
        message(),
        message({
          replyTo: { messageId: "other" as Id<"messages">, unavailable: true },
        }),
      ),
    ).toBe(false);
    expect(
      messagesConnect(
        message({ reactions: [{ emoji: "👍", count: 1, mine: false }] }),
        message(),
      ),
    ).toBe(false);
    // A quoted reply's text can still join a following ordinary message.
    expect(
      messagesConnect(
        message({
          replyTo: { messageId: "other" as Id<"messages">, unavailable: true },
        }),
        message(),
      ),
    ).toBe(true);
  });

  it("gives pictures and polls their own complete shapes on either side", () => {
    const picture = message({
      images: [
        {
          attachmentId: "picture" as Id<"attachments">,
          url: "/test.png",
          width: 10,
          height: 10,
        },
      ],
    });
    const poll = message({
      poll: {
        options: [
          { text: "Yes", votes: 0 },
          { text: "No", votes: 0 },
        ],
        myVote: null,
        totalVotes: 0,
      },
    });
    for (const richer of [picture, poll]) {
      expect(messagesConnect(message(), richer)).toBe(false);
      expect(messagesConnect(richer, message())).toBe(false);
    }
  });
});
