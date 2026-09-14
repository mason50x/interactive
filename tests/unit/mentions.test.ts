import { describe, expect, test } from "vitest";
import {
  completeMention,
  EVERYONE,
  findMentionTokens,
  mentionQueryAt,
  segmentMentions,
} from "@/lib/mentions";

describe("findMentionTokens", () => {
  test.each([
    ["@alice", [{ handle: "alice", start: 0, end: 6 }]],
    ["hi @Bob!", [{ handle: "bob", start: 3, end: 7 }]],
    [
      "@alice and @bob",
      [
        { handle: "alice", start: 0, end: 6 },
        { handle: "bob", start: 11, end: 15 },
      ],
    ],
    ["@ab", [{ handle: "ab", start: 0, end: 3 }]],
    [`@${"a".repeat(64)}`, [{ handle: "a".repeat(64), start: 0, end: 65 }]],
    ["@a_b-c", [{ handle: "a_b-c", start: 0, end: 6 }]],
    ["(@alice)", [{ handle: "alice", start: 1, end: 7 }]],
  ])("finds the mentions in %j", (text, tokens) => {
    expect(findMentionTokens(text)).toEqual(tokens);
  });

  test.each([
    ["@a", "one handle character is too short"],
    [`@${"a".repeat(65)}`, "sixty-five handle characters is too long"],
    ["x@alice", "preceded by a handle character"],
    ["_@alice", "preceded by an underscore"],
    ["-@alice", "preceded by a hyphen"],
    ["@@alice", "preceded by another @"],
    ["alice@example.com", "an email address"],
    ["@", "a bare @"],
    ["no mentions here", "plain text"],
  ])("does not match %j (%s)", (text) => {
    expect(findMentionTokens(text)).toEqual([]);
  });
});

describe("mentionQueryAt", () => {
  test.each([
    ["@ali", 4, { start: 0, query: "ali" }],
    ["hi @ali", 7, { start: 3, query: "ali" }],
    ["@Ali", 4, { start: 0, query: "ali" }],
    ["@", 1, { start: 0, query: "" }],
    ["say @", 5, { start: 4, query: "" }],
    ["@ali bob", 4, { start: 0, query: "ali" }],
  ])("%j at caret %i opens the picker", (text, caret, expected) => {
    expect(mentionQueryAt(text, caret)).toEqual(expected);
  });

  test.each([
    ["@alice", 3, "the caret is in the middle of a mention"],
    ["@alice", 0, "the caret is before the @"],
    ["hello", 5, "there is no @ before the caret"],
    ["a@b", 3, "the @ is inside a word"],
    ["@@ab", 4, "the @ follows another @"],
    ["", 0, "the text is empty"],
  ])("%j at caret %i returns null because %s", (text, caret) => {
    expect(mentionQueryAt(text, caret)).toBeNull();
  });
});

describe("completeMention", () => {
  test("replaces the partial word with the handle and a trailing space", () => {
    expect(completeMention("hi @al", 3, 6, "alice")).toEqual({
      text: "hi @alice ",
      caret: 10,
    });
  });

  test("keeps whatever followed the caret", () => {
    expect(completeMention("@al rest", 0, 3, "alice")).toEqual({
      text: "@alice  rest",
      caret: 7,
    });
  });

  test("works on an empty query straight after the @", () => {
    expect(completeMention("@", 0, 1, "bob")).toEqual({
      text: "@bob ",
      caret: 5,
    });
  });
});

describe("segmentMentions", () => {
  const resolve = (handle: string) =>
    handle === "alice" ? "user_alice" : handle === EVERYONE ? null : undefined;

  test("interleaves text with the mentions that resolved", () => {
    expect(segmentMentions("hi @Alice and @nobody!", resolve)).toEqual([
      { kind: "text", text: "hi " },
      {
        kind: "mention",
        text: "@Alice",
        handle: "alice",
        clerkId: "user_alice",
      },
      { kind: "text", text: " and @nobody!" },
    ]);
  });

  test("@everyone resolving to null is a mention with no clerkId", () => {
    const segments = segmentMentions("@everyone look", resolve);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      kind: "mention",
      text: "@everyone",
      handle: "everyone",
    });
    expect((segments[0] as { clerkId?: string }).clerkId).toBeUndefined();
    expect(segments[1]).toEqual({ kind: "text", text: " look" });
  });

  test("an unresolved mention stays inside the surrounding text", () => {
    expect(segmentMentions("see @nobody", resolve)).toEqual([
      { kind: "text", text: "see @nobody" },
    ]);
  });

  test("emits no empty text segments at either edge", () => {
    expect(segmentMentions("@alice", resolve)).toEqual([
      {
        kind: "mention",
        text: "@alice",
        handle: "alice",
        clerkId: "user_alice",
      },
    ]);
    expect(segmentMentions("", resolve)).toEqual([]);
  });

  test("adjacent mentions produce no text between them", () => {
    expect(
      segmentMentions("@alice @alice", resolve).map((segment) => segment.kind),
    ).toEqual(["mention", "text", "mention"]);
  });
});
