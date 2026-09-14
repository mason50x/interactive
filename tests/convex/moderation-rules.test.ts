import { expect, test } from "vitest";
import { BROADCAST, DUPLICATE_WINDOW_MS } from "@convex/moderation/limits";
import { buildForms } from "@convex/moderation/normalize";
import {
  hashBody,
  isBroadcast,
  isDuplicate,
  refusalForCategory,
  refusalForPattern,
  type RecentSend,
} from "@convex/moderation/rules";

const NOW = 10_000_000;

const send = (
  at: number,
  hash: string,
  conversationId = "room",
): RecentSend => ({ at, hash, conversationId, flagged: false });

const hashOf = (text: string) => hashBody(buildForms(text).squashed);

test("hashBody is stable, compact, and differs across inputs", () => {
  expect(hashBody("stopit")).toBe(hashBody("stopit"));
  expect(hashBody("stopit")).toMatch(/^[0-9a-z]+$/);
  expect(hashBody("stopit")).not.toBe(hashBody("stopit!"));
  expect(hashBody("")).toMatch(/^[0-9a-z]+$/);
});

test.each(["Stop it", "STOP IT", "st0p it", "sto p it", "  stop   it  ", "s.t.o.p it"])(
  "the folded form hashes the same as `stop it`: %s",
  (variant) => {
    expect(hashOf(variant)).toBe(hashOf("stop it"));
  },
);

test("different words hash differently", () => {
  expect(hashOf("stop it")).not.toBe(hashOf("stop"));
});

test.each([
  [0, true],
  [DUPLICATE_WINDOW_MS - 1, true],
  [DUPLICATE_WINDOW_MS, false],
  [DUPLICATE_WINDOW_MS + 1, false],
])("isDuplicate with the same hash %sms ago is %s", (age, expected) => {
  expect(isDuplicate([send(NOW - age, "h")], "h", NOW)).toBe(expected);
});

test("isDuplicate ignores other hashes but not other conversations", () => {
  expect(isDuplicate([], "h", NOW)).toBe(false);
  expect(isDuplicate([send(NOW, "other")], "h", NOW)).toBe(false);
  // Saying the same thing in another room is still saying it twice.
  expect(isDuplicate([send(NOW, "h", "elsewhere")], "h", NOW)).toBe(true);
  expect(
    isDuplicate([send(NOW - DUPLICATE_WINDOW_MS, "h"), send(NOW - 1, "h")], "h", NOW),
  ).toBe(true);
});

const otherRooms = (count: number, age = 0, hash = "h") =>
  Array.from({ length: count }, (_, i) => send(NOW - age, hash, `room-${i}`));

test("isBroadcast counts the current conversation, so the threshold lands on the third room", () => {
  expect(isBroadcast(otherRooms(BROADCAST.conversations - 1), "h", "here", NOW)).toBe(true);
  expect(isBroadcast(otherRooms(BROADCAST.conversations - 2), "h", "here", NOW)).toBe(false);
  // The current room in the ring is the same room, not another one.
  expect(
    isBroadcast(
      [...otherRooms(BROADCAST.conversations - 2), send(NOW, "h", "here")],
      "h",
      "here",
      NOW,
    ),
  ).toBe(false);
});

test("isBroadcast is about rooms, not repeats within one", () => {
  const sameRoom = Array.from({ length: 5 }, () => send(NOW, "h", "room-0"));
  expect(isBroadcast(sameRoom, "h", "here", NOW)).toBe(false);
});

test.each([
  [0, true],
  [BROADCAST.ms - 1, true],
  [BROADCAST.ms, false],
])("isBroadcast with the other rooms %sms ago is %s", (age, expected) => {
  expect(
    isBroadcast(otherRooms(BROADCAST.conversations - 1, age), "h", "here", NOW),
  ).toBe(expected);
});

test("isBroadcast only counts sends of the same text", () => {
  expect(
    isBroadcast(otherRooms(BROADCAST.conversations - 1, 0, "other"), "h", "here", NOW),
  ).toBe(false);
});

test.each([
  "slur",
  "sexual",
  "exploitation",
  "threat",
  "self-harm",
  "degrading",
  "profanity",
] as const)("refusalForCategory(%s) names the category", (category) => {
  expect(refusalForCategory(category)).toBe(category);
});

test.each(["contact", "link", "location"] as const)(
  "refusalForPattern(%s) names the category",
  (category) => {
    expect(refusalForPattern(category)).toBe(category);
  },
);
