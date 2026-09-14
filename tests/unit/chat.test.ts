import { describe, expect, test } from "vitest";
import {
  AVATAR_EMOJI,
  AVATAR_HUES,
  BOT_ID,
  conversationName,
  DELETE_WINDOW_MS,
  groupNameError,
  handleHue,
  isBot,
  MAX_INITIALS,
  MAX_TITLE,
  openDmError,
  personName,
  REACTIONS,
  refusalMessage,
  typingLabel,
  untilLabel,
  type Refusal,
} from "@/lib/chat";
import * as limits from "@convex/moderation/limits";

const DEFAULT_REFUSAL = "That message could not be sent.";

describe("mirrored constants match convex/moderation/limits", () => {
  test("REACTIONS, the avatar palette, and the size limits have not drifted", () => {
    expect(REACTIONS).toEqual(limits.REACTIONS);
    expect(AVATAR_HUES).toEqual(limits.AVATAR_HUES);
    expect(AVATAR_HUES).toEqual(limits.GROUP_HUES);
    expect(AVATAR_EMOJI).toEqual(limits.AVATAR_EMOJI);
    expect(AVATAR_EMOJI).toEqual(limits.GROUP_EMOJI);
    expect(MAX_TITLE).toBe(limits.MAX_TITLE);
    expect(MAX_INITIALS).toBe(limits.MAX_INITIALS);
    expect(DELETE_WINDOW_MS).toBe(limits.DELETE_WINDOW_MS);
  });
});

describe("personName", () => {
  test("prefers the display name and falls back to the handle", () => {
    expect(personName({ handle: "alice", displayName: "Alice A." })).toBe(
      "Alice A.",
    );
    expect(personName({ handle: "alice" })).toBe("alice");
  });
});

describe("typingLabel", () => {
  const people = ["alice", "bob", "cara", "dan", "eve"].map((handle) => ({
    handle,
  }));

  test.each([
    [0, ""],
    [1, "alice is typing"],
    [2, "alice and bob are typing"],
    [3, "alice, bob and cara are typing"],
    [4, "alice, bob and 2 others are typing"],
    [5, "alice, bob and 3 others are typing"],
  ])("names up to three people and counts the rest (%i)", (count, label) => {
    expect(typingLabel(people.slice(0, count))).toBe(label);
  });

  test("uses display names through personName", () => {
    expect(
      typingLabel([
        { handle: "alice", displayName: "Alice" },
        { handle: "bob" },
      ]),
    ).toBe("Alice and bob are typing");
  });
});

describe("conversationName", () => {
  test.each([
    [{ kind: "global" as const }, "Everyone"],
    [{ kind: "dm" as const, peerHandle: "bob", peerName: "Bobby" }, "Bobby"],
    [{ kind: "dm" as const, peerHandle: "bob" }, "bob"],
    [{ kind: "dm" as const }, "Direct message"],
    [{ kind: "group" as const, title: "Study hall" }, "Study hall"],
    [{ kind: "group" as const }, "Group"],
  ])("names %o as %s", (conversation, name) => {
    expect(conversationName(conversation)).toBe(name);
  });

  test("a global room ignores a title", () => {
    expect(conversationName({ kind: "global", title: "Nope" })).toBe(
      "Everyone",
    );
  });
});

describe("handleHue", () => {
  test.each(["alice", "bob", "a-very-long-handle_with_symbols-0123456789", ""])(
    "is a deterministic integer in [0, 360) for %j",
    (handle) => {
      const hue = handleHue(handle);
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
      expect(handleHue(handle)).toBe(hue);
    },
  );

  test("the empty handle hashes to zero", () => {
    expect(handleHue("")).toBe(0);
  });
});

describe("untilLabel", () => {
  const now = 1_000_000;
  test.each([
    [-5_000, "0 seconds"],
    [0, "0 seconds"],
    [1_000, "1 seconds"],
    [59_000, "59 seconds"],
    [59_400, "59 seconds"],
    [59_500, "a minute"],
    [60_000, "a minute"],
    [89_000, "a minute"],
    [90_000, "2 minutes"],
    [59 * 60_000, "59 minutes"],
    [59 * 60_000 + 30_000, "an hour"],
    [60 * 60_000, "an hour"],
    [89 * 60_000, "an hour"],
    [90 * 60_000, "2 hours"],
    [5 * 60 * 60_000, "5 hours"],
  ])("%i ms ahead reads as %s", (ahead, label) => {
    expect(untilLabel(now + ahead, now)).toBe(label);
  });
});

describe("refusalMessage", () => {
  const known = [
    "empty",
    "too-long",
    "hidden-characters",
    "reordering",
    "stacked-marks",
    "too-many-lines",
    "slur",
    "sexual",
    "exploitation",
    "threat",
    "self-harm",
    "degrading",
    "harassment",
    "profanity",
    "contact",
    "link",
    "location",
    "duplicate",
    "broadcast",
    "too-fast",
    "not-a-member",
    "blocked",
    "reply-unavailable",
    "mention",
    "mention-everyone",
    "graphic",
    "image",
    "image-check",
    "too-many-images",
  ] as Refusal[];

  test.each(known)("%s has a message of its own", (refusal) => {
    const message = refusalMessage(refusal);
    expect(message).not.toBe(DEFAULT_REFUSAL);
    expect(message.length).toBeGreaterThan(0);
  });

  test.each([
    ["empty", "There is nothing to send."],
    ["link", "Links are not allowed here."],
    ["duplicate", "You just sent that."],
    ["mention-everyone", "@everyone only works in a group."],
  ] as [Refusal, string][])("%s reads exactly as written", (refusal, text) => {
    expect(refusalMessage(refusal)).toBe(text);
  });

  test("an unknown refusal falls back to the generic message", () => {
    expect(refusalMessage("something-new" as Refusal)).toBe(DEFAULT_REFUSAL);
  });
});

describe("groupNameError", () => {
  test.each([
    ["no-profile", "Pick a handle first."],
    ["empty", "Give it a name first."],
    ["too-long", "That name is too long."],
    ["slur", "That name will not work. Try another."],
    ["profanity", "That name will not work. Try another."],
    ["never-heard-of-it", "That name will not work. Try another."],
  ] as [Refusal | "no-profile", string][])("%s", (reason, text) => {
    expect(groupNameError(reason)).toBe(text);
  });
});

describe("openDmError", () => {
  test.each([
    ["not-friends", "They only take messages from friends. Add them first."],
    ["blocked", "You cannot message this person."],
    ["unknown", "That account is gone."],
    ["no-profile", "Pick a handle first."],
  ] as const)("%s", (reason, text) => {
    expect(openDmError(reason)).toBe(text);
  });
});

describe("isBot", () => {
  test.each([
    [BOT_ID, true],
    [undefined, false],
    ["", false],
    [`${BOT_ID}2`, false],
    ["user_123", false],
  ])("%j -> %s", (clerkId, expected) => {
    expect(isBot(clerkId)).toBe(expected);
  });
});
