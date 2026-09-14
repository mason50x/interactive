import { expect, test } from "vitest";
import {
  BROADCAST,
  DUPLICATE_WINDOW_MS,
  MAX_BODY,
  RATES,
  TRUST,
  type Surface,
} from "@convex/moderation/limits";
import { buildForms } from "@convex/moderation/normalize";
import { hashBody, type RecentSend } from "@convex/moderation/rules";
import { screen, type SendContext } from "@convex/moderation/verdict";

const NOW = 30 * 24 * 60 * 60 * 1000;

/** An account old enough and busy enough to be trusted. */
const trusted: SendContext = {
  surface: "global",
  conversationId: "room",
  now: NOW,
  createdAt: NOW - TRUST.trustedAfterMs,
  messagesSent: TRUST.trustedAfterMessages,
  recent: [],
};

/** Made a minute ago and has said nothing. */
const fresh: SendContext = {
  ...trusted,
  createdAt: NOW - 60_000,
  messagesSent: 0,
};

const surfaces: Surface[] = ["global", "dm", "group"];

/** `n` characters with no run longer than one, so the run trim cannot shorten it. */
const long = (n: number) =>
  Array.from({ length: n }, (_, i) => "abcdefghij"[i % 10]).join("");

const send = (at: number, hash: string, conversationId = "room"): RecentSend => ({
  at,
  hash,
  conversationId,
  flagged: false,
});

const hashOf = (text: string) => hashBody(buildForms(text).squashed);

test.each(surfaces)("%s allows exactly MAX_BODY and refuses one more", (surface) => {
  const max = MAX_BODY[surface];
  expect(screen(long(max), { ...trusted, surface }).allow).toBe(true);
  expect(screen(long(max + 1), { ...trusted, surface })).toEqual({
    allow: false,
    refusal: "too-long",
  });
});

test("the global room is capped far below a private conversation", () => {
  const body = long(MAX_BODY.global + 1);
  expect(screen(body, { ...trusted, surface: "global" }).allow).toBe(false);
  expect(screen(body, { ...trusted, surface: "dm" }).allow).toBe(true);
  expect(screen(body, { ...trusted, surface: "group" }).allow).toBe(true);
});

test("a fresh account is rate limited where a trusted one is not", () => {
  const burst = Array.from({ length: RATES.fresh[0].count }, (_, i) =>
    send(NOW - 1 - i, `h${i}`),
  );
  expect(screen("hello", { ...fresh, recent: burst })).toEqual({
    allow: false,
    refusal: "too-fast",
  });
  expect(screen("hello", { ...fresh, recent: burst.slice(1) }).allow).toBe(true);
  expect(screen("hello", { ...trusted, recent: burst }).allow).toBe(true);
});

test("the rate check runs before the shape check", () => {
  const burst = Array.from({ length: RATES.trusted[0].count }, (_, i) =>
    send(NOW - 1 - i, `h${i}`),
  );
  expect(screen("   ", { ...trusted, recent: burst })).toEqual({
    allow: false,
    refusal: "too-fast",
  });
  expect(screen("   ", trusted)).toEqual({ allow: false, refusal: "empty" });
});

test.each([
  ["abc‮def", "reordering"],
  ["a\n".repeat(13), "too-many-lines"],
  ["a" + "̶".repeat(3), "stacked-marks"],
] as const)("shape refusals pass through: %j is %s", (raw, refusal) => {
  expect(screen(raw, trusted)).toEqual({ allow: false, refusal });
});

test("an allowed message stores the cleaned text and the hash of its folded form", () => {
  const verdict = screen("  hi​ there!  ", trusted);
  expect(verdict).toEqual({
    allow: true,
    body: "hi there!",
    hash: hashOf("hi there!"),
  });
});

test.each([
  ["Hello, everyone!", 0],
  ["Hello, everyone!", DUPLICATE_WINDOW_MS - 1],
  // The folded form is what is compared, so respelling does not help.
  ["h e l l o, everyone!", 0],
  ["HELLO EVERYONE!", 0],
])("%s sent again %sms after the same text is a duplicate", (body, age) => {
  const recent = [send(NOW - age, hashOf("Hello, everyone!"))];
  expect(screen(body, { ...trusted, recent })).toEqual({
    allow: false,
    refusal: "duplicate",
  });
});

test("a duplicate is a duplicate in any conversation, until the window closes", () => {
  const hash = hashOf("Hello, everyone!");
  expect(
    screen("Hello, everyone!", {
      ...trusted,
      conversationId: "other",
      recent: [send(NOW, hash)],
    }),
  ).toEqual({ allow: false, refusal: "duplicate" });
  expect(
    screen("Hello, everyone!", {
      ...trusted,
      recent: [send(NOW - DUPLICATE_WINDOW_MS, hash)],
    }),
  ).toEqual({ allow: true, body: "Hello, everyone!", hash });
});

test("the same text into a third conversation inside the broadcast window is refused", () => {
  const hash = hashOf("join my group");
  const recent = Array.from({ length: BROADCAST.conversations - 1 }, (_, i) =>
    send(NOW - BROADCAST.ms + 1, hash, `room-${i}`),
  );
  const verdict = screen("join my group", {
    ...trusted,
    conversationId: "room-new",
    recent,
  });
  expect(verdict.allow).toBe(false);
  // The duplicate window is twice the broadcast window and is checked first,
  // so this arrives as `duplicate`; `broadcast` is not reachable from here.
  // See the report accompanying these tests.
  expect(verdict.allow === false && verdict.refusal).toBe("duplicate");
});

test("a picture with no words is allowed, and never a duplicate of itself", () => {
  const withImage = { ...trusted, attachmentKey: "att1" };
  const verdict = screen("   ", withImage);
  expect(verdict).toEqual({
    allow: true,
    body: "",
    hash: hashBody("image:att1"),
  });
  expect(
    screen("   ", { ...withImage, recent: [send(NOW, hashBody("image:att1"))] }),
  ).toEqual(verdict);
  // The rate still applies to a picture.
  const burst = Array.from({ length: RATES.trusted[0].count }, (_, i) =>
    send(NOW - 1 - i, `h${i}`),
  );
  expect(screen("   ", { ...withImage, recent: burst })).toEqual({
    allow: false,
    refusal: "too-fast",
  });
});

test("verified mentions are masked for the patterns but stored as written", () => {
  const verdict = screen("thanks @Alice, see you at 8", {
    ...trusted,
    mentions: new Set(["alice"]),
  });
  expect(verdict).toEqual({
    allow: true,
    body: "thanks @Alice, see you at 8",
    hash: hashOf("thanks @Alice, see you at 8"),
  });
  // Masking cannot hide contact details that are not a mention.
  expect(
    screen("email me@example.com", { ...trusted, mentions: new Set(["example"]) }),
  ).toEqual({ allow: false, refusal: "contact" });
});

test("a reserved handle exempted from the lexicon still leaves the body intact", () => {
  const verdict = screen("@bot what time is it", {
    ...trusted,
    mentions: new Set(["bot"]),
    lexiconExemptMentions: new Set(["bot"]),
  });
  expect(verdict).toEqual({
    allow: true,
    body: "@bot what time is it",
    hash: hashOf("@bot what time is it"),
  });
});
