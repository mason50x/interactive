import { expect, test } from "vitest";
import { pickLook } from "@convex/chat/look";
import { dmKeyFor, heirOf, pairOf, pushRecent } from "@convex/chat/shared";
import { looksLikeEmail, normalizeEmail } from "@convex/email";
import { callerId, callerUser, userByClerkId } from "@convex/identity";
import {
  AVATAR_EMOJI,
  AVATAR_HUES,
  MAX_INITIALS,
  RECENT_RING,
} from "@convex/moderation/limits";
import type { RecentSend } from "@convex/moderation/rules";
import { makeConvexTest } from "../helpers/convex";

const wheel = AVATAR_HUES;
const faces = AVATAR_EMOJI;

test.each([
  // A hue must be on the wheel and an emoji one of the faces; both drop quietly.
  [{ hue: wheel[0], emoji: faces[0] }, { hue: wheel[0], emoji: faces[0] }],
  [{ hue: wheel[0] + 1, emoji: "💩" }, {}],
  [{ hue: -10 }, {}],
  // Initials only when there is no emoji, and only 1-2 alphanumerics, trimmed.
  [{ emoji: faces[1], initials: "AB" }, { emoji: faces[1] }],
  [{ emoji: "💩", initials: "AB" }, { initials: "AB" }],
  [{ initials: "  ab " }, { initials: "ab" }],
  [{ initials: "a" }, { initials: "a" }],
  [{ initials: "42" }, { initials: "42" }],
  [{ initials: "a".repeat(MAX_INITIALS + 1) }, {}],
  [{ initials: "a!" }, {}],
  [{ initials: "a b" }, {}],
  [{ initials: "   " }, {}],
  [{}, {}],
])("pickLook(%j) is %j", (asked, expected) => {
  const look = pickLook(wheel, faces, asked);
  expect(look).toEqual(expected);
  // Every field is present on the result, set or not.
  expect(Object.keys(look).sort()).toEqual(["emoji", "hue", "initials"]);
});

type Member = { role: "owner" | "admin" | "member"; joinedAt: number; id: string };
const member = (id: string, role: Member["role"], joinedAt: number): Member => ({
  id,
  role,
  joinedAt,
});

test("heirOf prefers the longest-standing admin, then the longest-standing member", () => {
  const rows = [
    member("m1", "member", 1),
    member("a5", "admin", 5),
    member("a3", "admin", 3),
    member("m0", "member", 0),
  ];
  expect(heirOf(rows)?.id).toBe("a3");
  expect(heirOf(rows.filter((row) => row.role === "member"))?.id).toBe("m0");
  expect(heirOf([member("m9", "member", 9)])?.id).toBe("m9");
});

test("heirOf returns undefined for nobody and does not reorder its input", () => {
  expect(heirOf([])).toBeUndefined();
  const rows: readonly Member[] = [
    member("m1", "member", 1),
    member("a5", "admin", 5),
  ];
  const before = [...rows];
  expect(heirOf(rows)?.id).toBe("a5");
  expect(rows).toEqual(before);
});

test("pairOf and dmKeyFor are the same for either order", () => {
  expect(pairOf("bob", "alice")).toEqual({ userA: "alice", userB: "bob" });
  expect(pairOf("alice", "bob")).toEqual({ userA: "alice", userB: "bob" });
  expect(dmKeyFor("bob", "alice")).toBe("alice|bob");
  expect(dmKeyFor("alice", "bob")).toBe(dmKeyFor("bob", "alice"));
  expect(dmKeyFor("bot", "zed")).toBe("bot|zed");
});

test("pushRecent keeps the newest RECENT_RING sends without mutating the ring", () => {
  const send = (at: number): RecentSend => ({
    at,
    conversationId: "c",
    hash: String(at),
    flagged: false,
  });
  let ring: RecentSend[] = [];
  for (let at = 0; at < RECENT_RING; at += 1) {
    const next = pushRecent(ring, send(at));
    expect(next).toHaveLength(at + 1);
    expect(next).not.toBe(ring);
    ring = next;
  }
  const full = [...ring];
  const overflow = pushRecent(ring, send(RECENT_RING));
  expect(ring).toEqual(full);
  expect(overflow).toHaveLength(RECENT_RING);
  expect(overflow[0].at).toBe(1);
  expect(overflow[RECENT_RING - 1].at).toBe(RECENT_RING);
});

test.each([
  ["Sam@Example.com", "sam@example.com"],
  ["  sam@example.com\n", "sam@example.com"],
  ["sam@example.com", "sam@example.com"],
])("normalizeEmail(%j) is %j", (email, normalized) => {
  expect(normalizeEmail(email)).toBe(normalized);
});

test.each([
  ["sam@example.com", true],
  ["s.am+tag@sub.example.co.uk", true],
  ["sam@localhost", false],
  ["sam@", false],
  ["@example.com", false],
  ["sam example@example.com", false],
  ["sam@@example.com", false],
  ["", false],
])("looksLikeEmail(%j) is %s", (email, expected) => {
  expect(looksLikeEmail(email)).toBe(expected);
});

test("callerId is the Clerk subject, or null when signed out", async () => {
  const t = makeConvexTest();
  expect(await t.run((ctx) => callerId(ctx))).toBeNull();
  expect(
    await t.withIdentity({ subject: "a" }).run((ctx) => callerId(ctx)),
  ).toBe("a");
});

test("userByClerkId and callerUser read the mirrored account, or null before sync", async () => {
  const t = makeConvexTest();
  const signedIn = t.withIdentity({ subject: "a" });

  expect(await t.run((ctx) => userByClerkId(ctx, "a"))).toBeNull();
  expect(await t.run((ctx) => callerUser(ctx))).toBeNull();
  expect(await signedIn.run((ctx) => callerUser(ctx))).toBeNull();

  const id = await t.run((ctx) =>
    ctx.db.insert("users", { clerkId: "a", email: "a@example.com" }),
  );
  expect(await t.run((ctx) => userByClerkId(ctx, "a"))).toMatchObject({
    _id: id,
    clerkId: "a",
  });
  expect(await signedIn.run((ctx) => callerUser(ctx))).toMatchObject({
    _id: id,
  });
  expect(await t.run((ctx) => callerUser(ctx))).toBeNull();
  expect(
    await t.withIdentity({ subject: "b" }).run((ctx) => callerUser(ctx)),
  ).toBeNull();
});
