import { expect, test } from "vitest";
import {
  foldConfusable,
  foldLeet,
  isBidi,
  isInvisible,
  isTagCharacter,
} from "@convex/moderation/confusables";
import {
  MAX_CHAR_RUN,
  MAX_COMBINING_RUN,
  MAX_NEWLINES,
} from "@convex/moderation/limits";
import {
  buildForms,
  encodeRuns,
  matchRuns,
  prepare,
} from "@convex/moderation/normalize";

const MAX = 100;

/** `n` characters with no run longer than one, so the run trim cannot shorten it. */
const long = (n: number) =>
  Array.from({ length: n }, (_, i) => "abcdefghij"[i % 10]).join("");

const ok = (raw: string, maxBody = MAX) => {
  const prepared = prepare(raw, maxBody);
  if (!prepared.ok) throw new Error(`refused: ${prepared.reason}`);
  return prepared;
};

test("prepare returns the stored text and the forms the rules read", () => {
  const prepared = ok("  Hello​ there  ");
  expect(prepared.clean).toBe("Hello there");
  expect(prepared.forms).toEqual({
    tokens: ["hello", "there"],
    squashed: "hellothere",
    sepBefore: [
      false, false, false, false, false,
      true, false, false, false, false,
    ],
    runs: encodeRuns("hellothere"),
  });
  expect(prepared.forms).toEqual(buildForms(prepared.clean));
});

test.each([
  ["   ", "empty"],
  ["​​", "empty"],
  [long(MAX + 1), "too-long"],
  ["abc‮def", "reordering"],
  ["abc\u{e0041}", "reordering"],
  ["a" + "̶".repeat(MAX_COMBINING_RUN + 1), "stacked-marks"],
  ["a\n".repeat(MAX_NEWLINES + 1), "too-many-lines"],
] as const)("prepare refuses %j as %s", (raw, reason) => {
  expect(prepare(raw, MAX)).toEqual({ ok: false, reason });
});

test("the raw length is refused before any character is read", () => {
  // Every character repeats, so the run trim would leave sixteen. The early
  // check does not care: it is there so a pathological input is never walked.
  expect(prepare("x".repeat(MAX * 4 + 1), MAX)).toEqual({
    ok: false,
    reason: "too-long",
  });
  expect(ok("x".repeat(MAX * 4)).clean).toBe("x".repeat(MAX_CHAR_RUN));
});

test.each([
  ["a" + "̶".repeat(MAX_COMBINING_RUN)],
  ["a\n".repeat(MAX_NEWLINES) + "b"],
  [long(MAX)],
])("prepare accepts the boundary %j", (raw) => {
  expect(prepare(raw, MAX).ok).toBe(true);
});

test("long runs are trimmed, controls are dropped, tab and newline survive", () => {
  expect(ok("wow" + "!".repeat(40)).clean).toBe("wow" + "!".repeat(MAX_CHAR_RUN));
  expect(ok("ab\tc\nde").clean).toBe("ab\tc\nde");
});

test.each([
  // Leet folds into the matching forms, never into the stored text.
  ["5h1t", ["shit"], "shit"],
  ["l8r 4 u", ["lbr", "a", "u"], "lbrau"],
  // Separators split tokens and vanish from `squashed`.
  ["n.i.g.g.e.r", ["n", "i", "g", "g", "e", "r"], "nigger"],
  ["s h 1 t", ["s", "h", "i", "t"], "shit"],
  ["Scunthorpe", ["scunthorpe"], "scunthorpe"],
  // NFKC, accents, multi-letter confusables, and cross-script lookalikes.
  ["ｆｕｌｌ 𝐛𝐨𝐥𝐝 ⓕ", ["full", "bold", "f"], "fullboldf"],
  ["café straße", ["cafe", "strasse"], "cafestrasse"],
  ["Ааa", ["aaa"], "aaa"],
])("buildForms folds %s", (clean, tokens, squashed) => {
  const forms = buildForms(clean);
  expect(forms.tokens).toEqual(tokens);
  expect(forms.squashed).toBe(squashed);
  expect(forms.runs).toEqual(encodeRuns(squashed));
  expect(forms.sepBefore).toHaveLength(squashed.length);
});

test("sepBefore remembers where the separators were", () => {
  expect(buildForms("n.i.g.g.e.r").sepBefore).toEqual([
    false, true, true, true, true, true,
  ]);
  expect(buildForms("Scunthorpe").sepBefore).toEqual(Array(10).fill(false));
  expect(buildForms("sh it").sepBefore).toEqual([false, false, true, false]);
});

test.each([
  ["", []],
  ["a", [{ character: "a", length: 1, at: 0 }]],
  [
    "soooo",
    [
      { character: "s", length: 1, at: 0 },
      { character: "o", length: 4, at: 1 },
    ],
  ],
  [
    "aabaa",
    [
      { character: "a", length: 2, at: 0 },
      { character: "b", length: 1, at: 2 },
      { character: "a", length: 2, at: 3 },
    ],
  ],
])("encodeRuns(%j)", (value, runs) => {
  expect(encodeRuns(value)).toEqual(runs);
});

test.each([
  // Stretching: the text may have more of a letter than the term.
  ["soooo", "so", { start: 0, end: 5 }],
  ["xaaassssy", "ass", { start: 1, end: 8 }],
  ["ffuck", "fuck", { start: 0, end: 5 }],
  // Never fewer: `as` is one `s` short of `ass`.
  ["as", "ass", null],
  ["xasx", "ass", null],
  // Different letters never match, and a term needs to appear whole.
  ["soso", "os", { start: 1, end: 3 }],
  ["sx", "so", null],
  ["s", "so", null],
])("matchRuns finds %s in %s", (haystack, term, expected) => {
  expect(matchRuns(encodeRuns(haystack), encodeRuns(term))).toEqual(expected);
});

test("matchRuns starts from the run offset it is given and refuses an empty term", () => {
  const haystack = encodeRuns("sosoo");
  expect(matchRuns(haystack, encodeRuns("so"), 1)).toEqual({ start: 2, end: 5 });
  expect(matchRuns(haystack, encodeRuns("so"), 3)).toBeNull();
  expect(matchRuns(haystack, [])).toBeNull();
});

test.each([
  ["а", "a"],
  ["ß", "ss"],
  ["0", "o"],
  ["Ø", "o"],
  ["a", undefined],
  ["1", undefined],
])("foldConfusable(%j) is %j", (character, folded) => {
  expect(foldConfusable(character)).toBe(folded);
});

test.each([
  ["1", "i"],
  ["$", "s"],
  ["@", "a"],
  ["+", "t"],
  // `0` lives with the confusables so it folds in one place.
  ["0", undefined],
  ["a", undefined],
])("foldLeet(%j) is %j", (character, folded) => {
  expect(foldLeet(character)).toBe(folded);
});

test.each([
  ["​", true],
  ["­", true],
  ["﻿", true],
  [" ", false],
  ["a", false],
])("isInvisible(%j) is %s", (character, expected) => {
  expect(isInvisible(character)).toBe(expected);
});

test.each([
  ["‮", true],
  ["⁦", true],
  ["​", false],
  ["a", false],
])("isBidi(%j) is %s", (character, expected) => {
  expect(isBidi(character)).toBe(expected);
});

test.each([
  [0xe0000, true],
  [0xe0041, true],
  [0xe007f, true],
  [0xe0080, false],
  [0xdffff, false],
  [0x41, false],
])("isTagCharacter(%s) is %s", (codePoint, expected) => {
  expect(isTagCharacter(codePoint)).toBe(expected);
});
