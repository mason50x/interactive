import { describe, expect, test } from "vitest";
import { shouldNotifyMessage } from "../../src/lib/chat-notifications";

describe("chat desktop notification eligibility", () => {
  const incoming = {
    previous: { id: "previous", at: 10 },
    current: { id: "new", at: 20, authorId: "friend" },
    accountId: "reader",
    unread: 1,
    visibleConversation: false,
  };

  test("alerts on an unread incoming message outside the visible conversation", () => {
    expect(shouldNotifyMessage(incoming)).toBe(true);
  });

  test("does not replay the initial message snapshot", () => {
    expect(shouldNotifyMessage({ ...incoming, previous: undefined })).toBe(
      false,
    );
  });

  test("does not repeat notifications on edits or subscription rerenders", () => {
    expect(
      shouldNotifyMessage({
        ...incoming,
        current: { ...incoming.current, id: "previous" },
      }),
    ).toBe(false);
  });

  test("does not alert when deletion reveals an older latest message", () => {
    expect(
      shouldNotifyMessage({
        ...incoming,
        current: { ...incoming.current, at: 5 },
      }),
    ).toBe(false);
  });

  test("does not notify for own messages, read messages, or the visible thread", () => {
    expect(
      shouldNotifyMessage({
        ...incoming,
        current: { ...incoming.current, authorId: "reader" },
      }),
    ).toBe(false);
    expect(shouldNotifyMessage({ ...incoming, unread: 0 })).toBe(false);
    expect(
      shouldNotifyMessage({ ...incoming, visibleConversation: true }),
    ).toBe(false);
  });
});
