import { expect, test } from "vitest";
import { screen, screenStatic } from "../../convex/moderation/verdict";

const context = {
  surface: "global" as const, conversationId: "room", now: 100000,
  createdAt: 0, messagesSent: 1000, recent: [],
};

test.each([
  "movie", "streaming", "what do you guys think", "what do you guys think about streaming a movie?",
  "I am streaming on Twitch", "join my discord", "https://example.com/movie",
  "this game is shit", "damn you guys are good", "you are stupid",
  "queer history", "the Holocaust", "cheese pizza", "cp", "assignment", "analysis",
  "classic movie", "watch it", "123 456 789", "my steam library",
])("allows ordinary conversation: %s", body => {
  for (const surface of ["global", "dm", "group"] as const)
    expect(screen(body, { ...context, surface }).allow).toBe(true);
});

test.each([
  ["nigger", "slur"], ["n.i.g.g.e.r", "slur"], ["faggot", "slur"],
  ["i will kill you", "threat"], ["kill yourself", "self-harm"],
  ["child pornography", "exploitation"], ["send nudes", "sexual"],
  ["i will dox you", "degrading"], ["me@example.com", "contact"],
  ["call me at 555-123-4567", "contact"], ["123 Main Street", "location"],
])("still refuses severe content or private details: %s", (body, refusal) => {
  expect(screen(body, context)).toEqual({ allow: false, refusal });
});

test("names use the corrected boundaries while retaining profanity checks", () => {
  expect(screenStatic("Movie streaming", 40).ok).toBe(true);
  expect(screenStatic("Queer cinema", 40).ok).toBe(true);
  expect(screenStatic("asshole", 40).ok).toBe(false);
});

test.each([
  ["s&#101;nd nudes", "sexual"],
  ["s&#x65;nd nudes", "sexual"],
  ["&scedil;end nudes", "sexual"],
  ["me&commat;example&period;com", "contact"],
  ["call me at 555&#45;123&#45;4567", "contact"],
  ["Hello&#x202E;", "reordering"],
])("screens decoded Markdown entities: %s", (body, refusal) => {
  expect(screen(body, context)).toEqual({ allow: false, refusal });
});

test.each([
  "**Hello** and *friends* &amp; `code`",
  "- First item\n- Second item",
  "An entity spelled literally: &amp;commat;",
  "An escaped entity: \\&commat;",
])("preserves accepted raw Markdown in storage: %s", body => {
  expect(screen(body, context)).toMatchObject({ allow: true, body });
});

test("third consecutive visible copy is refused, with no time window", () => {
  const original = screen("Hello there", context);
  if (!original.allow) throw new Error("Test text should be accepted");
  const copy = { at: context.now - 24 * 60 * 60_000, conversationId: context.conversationId, hash: original.hash, flagged: false };
  expect(screen("H&#101;llo there", { ...context, recent: [copy] }).allow).toBe(true);
  expect(screen("H&#101;llo there", { ...context, recent: [copy, copy] })).toEqual({ allow: false, refusal: "duplicate" });
  const different = screen("Something else", context);
  if (!different.allow) throw new Error("Test text should be accepted");
  expect(screen("H&#101;llo there", { ...context, recent: [copy, { ...copy, hash: different.hash }] }).allow).toBe(true);
});

test("rapid different messages are not rate limited", () => {
  const recent = Array.from({ length: 20 }, (_, index) => ({
    at: context.now,
    conversationId: context.conversationId,
    hash: String(index),
    flagged: false,
  }));
  expect(screen("A new thought", { ...context, recent }).allow).toBe(true);
});
