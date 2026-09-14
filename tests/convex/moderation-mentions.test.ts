import { expect, test } from "vitest";
import {
  EVERYONE,
  findMentionTokens,
  maskMentions,
} from "@convex/moderation/mentions";

test("tokens carry the lowercased handle and the offsets of the `@word`", () => {
  const text = "hi @Alice and @bob_2, see @Carol-x.";
  const tokens = findMentionTokens(text);
  expect(tokens).toEqual([
    { handle: "alice", start: 3, end: 9 },
    { handle: "bob_2", start: 14, end: 20 },
    { handle: "carol-x", start: 26, end: 34 },
  ]);
  for (const token of tokens) {
    expect(text.slice(token.start, token.end)).toBe(`@${text.slice(token.start + 1, token.end)}`);
    expect(text.slice(token.start + 1, token.end).toLowerCase()).toBe(token.handle);
  }
});

test.each([
  [1, false],
  [2, true],
  [64, true],
  [65, false],
])("a handle of %s characters is a mention: %s", (length, expected) => {
  const handle = "x".repeat(length);
  const tokens = findMentionTokens(`hello @${handle} there`);
  expect(tokens.map((token) => token.handle)).toEqual(expected ? [handle] : []);
});

test.each([
  // Glued onto the word before it: an email address is not a mention.
  ["me@example.com", []],
  ["a@bc", []],
  ["@@alice", []],
  ["-@alice", []],
  // Not glued: at the start, after a space, or after punctuation.
  ["@alice", ["alice"]],
  ["(@alice)", ["alice"]],
  ["hey @Alice.", ["alice"]],
  ["@alice_ and @bob-", ["alice_", "bob-"]],
  ["@everyone look", [EVERYONE]],
])("findMentionTokens(%j) finds %j", (text, handles) => {
  expect(findMentionTokens(text).map((token) => token.handle)).toEqual(handles);
});

test("EVERYONE is the reserved word, lowercase, without the `@`", () => {
  expect(EVERYONE).toBe("everyone");
  expect(findMentionTokens("@EVERYONE")[0]?.handle).toBe(EVERYONE);
});

test("maskMentions blanks only the verified handles", () => {
  const text = "add @alice and @Mallory on discord";
  const masked = maskMentions(text, new Set(["alice"]));
  expect(masked).not.toContain("@alice");
  expect(masked).toContain("@Mallory");
  // Each mention becomes one space, so the words around it stay apart.
  expect(masked).toBe("add   and @Mallory on discord");
  expect(masked.split(/\s+/)).toEqual(["add", "and", "@Mallory", "on", "discord"]);
});

test("maskMentions matches the lowercased handle and handles edges of the text", () => {
  expect(maskMentions("@Bob hi @ALICE", new Set(["bob", "alice"]))).toBe("  hi  ");
  expect(maskMentions("@bob", new Set(["bob"]))).toBe(" ");
});

test("maskMentions leaves the text alone when nothing is verified", () => {
  const text = "add @alice on discord";
  expect(maskMentions(text, new Set())).toBe(text);
  expect(maskMentions(text, new Set(["bob"]))).toBe(text);
  // An email is never a mention, so it is never masked either.
  expect(maskMentions("me@alice.com", new Set(["alice", "alice.com"]))).toBe("me@alice.com");
});
