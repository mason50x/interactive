import { expect, test } from "vitest";
import { BOT_AVATAR, BOT_HANDLE, BOT_ID, BOT_NAME } from "@config/bot";
import {
  ensureGlobalRoom,
  globalRoom,
  peerIdentity,
} from "@convex/chat/shared";
import { makeConvexTest } from "../helpers/convex";

const nobody = {
  peerHandle: undefined,
  peerName: undefined,
  peerAvatarUrl: undefined,
  peerAvatarHue: undefined,
  peerAvatarEmoji: undefined,
  peerAvatarInitials: undefined,
};

test("the bot is named from botConfig, with no profile row at all", async () => {
  const t = makeConvexTest();
  expect(await t.run((ctx) => peerIdentity(ctx, BOT_ID))).toEqual({
    ...nobody,
    peerHandle: BOT_HANDLE,
    peerName: BOT_NAME,
    peerAvatarUrl: BOT_AVATAR,
  });
});

test("an unknown peer reads as nobody", async () => {
  const t = makeConvexTest();
  await t.run((ctx) =>
    ctx.db.insert("users", { clerkId: "ghost", imageUrl: "https://img/ghost" }),
  );
  expect(await t.run((ctx) => peerIdentity(ctx, "ghost"))).toEqual(nobody);
});

test("a custom avatar comes from the profile and never from the account picture", async () => {
  const t = makeConvexTest();
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { clerkId: "alice", imageUrl: "https://img/alice" });
    await ctx.db.insert("chatProfiles", {
      clerkId: "alice",
      handle: "Alice",
      handleKey: "alice",
      displayName: "Alice A",
      createdAt: 0,
      avatarMode: "custom",
      avatarHue: 40,
      avatarEmoji: "🦊",
      avatarInitials: "AA",
    });
  });
  expect(await t.run((ctx) => peerIdentity(ctx, "alice"))).toEqual({
    peerHandle: "Alice",
    peerName: "Alice A",
    peerAvatarUrl: undefined,
    peerAvatarHue: 40,
    peerAvatarEmoji: "🦊",
    peerAvatarInitials: "AA",
  });
});

test.each(["account", undefined] as const)(
  "avatarMode %s reads the account picture from users",
  async (avatarMode) => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { clerkId: "bob", imageUrl: "https://img/bob" });
      await ctx.db.insert("chatProfiles", {
        clerkId: "bob",
        handle: "bob",
        handleKey: "bob",
        createdAt: 0,
        avatarMode,
        avatarHue: 70,
      });
    });
    expect(await t.run((ctx) => peerIdentity(ctx, "bob"))).toEqual({
      ...nobody,
      peerHandle: "bob",
      peerAvatarUrl: "https://img/bob",
      peerAvatarHue: 70,
    });
  },
);

test("an account-mode profile with no synced user has no picture", async () => {
  const t = makeConvexTest();
  await t.run((ctx) =>
    ctx.db.insert("chatProfiles", {
      clerkId: "carol",
      handle: "carol",
      handleKey: "carol",
      createdAt: 0,
      avatarMode: "account",
    }),
  );
  expect(await t.run((ctx) => peerIdentity(ctx, "carol"))).toEqual({
    ...nobody,
    peerHandle: "carol",
  });
});

test("globalRoom is null until ensureGlobalRoom makes the one row", async () => {
  const t = makeConvexTest();
  expect(await t.run((ctx) => globalRoom(ctx))).toBeNull();

  const id = await t.run((ctx) => ensureGlobalRoom(ctx, "alice"));
  expect(await t.run((ctx) => globalRoom(ctx))).toMatchObject({
    _id: id,
    kind: "global",
    createdBy: "alice",
  });

  // A second call finds the same room rather than making another.
  expect(await t.run((ctx) => ensureGlobalRoom(ctx, "bob"))).toBe(id);
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("conversations")
        .withIndex("byKind", (q) => q.eq("kind", "global"))
        .collect(),
    ),
  ).toHaveLength(1);
});
