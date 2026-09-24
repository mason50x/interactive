/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 24, 12));
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify({
      ceo: "ceo",
      head: "head_moderator",
      mod: "moderator",
      builder: "builder",
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  for (const id of ["ceo", "head", "mod", "builder", "member", "spammer"]) {
    await t.mutation(internal.users.upsertFromClerk, {
      data: { id, username: id, updated_at: 1 },
    });
  }
  const as = (subject: string) => t.withIdentity({ subject });
  const rows = await as("member").query(api.chat.conversations.list, {});
  const room = rows.find((row) => row.kind === "global")!._id;
  const group = await t.run(async (ctx) => {
    const id = await ctx.db.insert("conversations", {
      kind: "group",
      title: "Friends",
      createdBy: "mod",
      createdAt: Date.now(),
    });
    await ctx.db.insert("conversationMembers", {
      conversationId: id,
      clerkId: "mod",
      kind: "group",
      role: "owner",
      status: "active",
      joinedAt: Date.now(),
      lastReadAt: 0,
    });
    return id;
  });
  return { t, as, room, group };
}

async function seed(
  t: Awaited<ReturnType<typeof setup>>["t"],
  conversationId: Id<"conversations">,
  authors: string[],
) {
  await t.run(async (ctx) => {
    for (const [index, author] of authors.entries()) {
      await ctx.db.insert("messages", {
        conversationId,
        authorClerkId: author,
        authorHandle: author,
        body: `message ${index}`,
        status: "visible",
        flags: [],
      });
    }
  });
}

async function remaining(
  t: Awaited<ReturnType<typeof setup>>["t"],
  conversationId: Id<"conversations">,
) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("messages")
        .withIndex("byConversation", (q) =>
          q.eq("conversationId", conversationId),
        )
        .collect()
    ).map((message) => message.authorClerkId),
  );
}

test("only moderators and above can change room controls, and only in Everyone", async () => {
  const { as, room, group } = await setup();
  for (const subject of ["member", "builder"]) {
    await expect(
      as(subject).mutation(api.chat.roomControls.set, {
        conversationId: room,
        locked: true,
      }),
    ).rejects.toThrow("Moderator access required.");
    await expect(
      as(subject).mutation(api.chat.roomControls.bulkDelete, {
        conversationId: room,
        count: 10,
      }),
    ).rejects.toThrow("Moderator access required.");
  }
  await expect(
    as("mod").mutation(api.chat.roomControls.set, {
      conversationId: group,
      locked: true,
    }),
  ).rejects.toThrow("Room controls are only for the Everyone room.");
  await expect(
    as("mod").mutation(api.chat.roomControls.set, {
      conversationId: room,
      slowModeSeconds: 7,
    }),
  ).rejects.toThrow("Choose one of the slow mode options.");

  for (const subject of ["mod", "head", "ceo"]) {
    expect(
      await as(subject).mutation(api.chat.roomControls.set, {
        conversationId: room,
        slowModeSeconds: 30,
      }),
    ).toEqual({ locked: false, slowModeSeconds: 30 });
  }
  expect(
    await as("member").query(api.chat.roomControls.get, {
      conversationId: room,
    }),
  ).toEqual({ locked: false, slowModeSeconds: 30 });
});

test("a lock stops members sending and editing while staff can still post", async () => {
  const { t, as, room } = await setup();
  const sent = await as("member").mutation(api.chat.messages.send, {
    conversationId: room,
    body: "hello there",
  });
  expect(sent).toEqual({ ok: true });
  await as("mod").mutation(api.chat.roomControls.set, {
    conversationId: room,
    locked: true,
  });

  expect(
    await as("member").mutation(api.chat.messages.send, {
      conversationId: room,
      body: "let me in",
    }),
  ).toEqual({ ok: false, refusal: "locked" });
  expect(
    await as("builder").mutation(api.chat.messages.send, {
      conversationId: room,
      body: "builders too",
    }),
  ).toEqual({ ok: false, refusal: "locked" });
  const mine = await t.run(async (ctx) => {
    const row = await ctx.db
      .query("messages")
      .withIndex("byAuthor", (q) => q.eq("authorClerkId", "member"))
      .first();
    return row!._id;
  });
  expect(
    await as("member").mutation(api.chat.messages.edit, {
      messageId: mine,
      body: "edited while locked",
    }),
  ).toEqual({ ok: false, refusal: "read-only" });
  expect(
    await as("mod").mutation(api.chat.messages.send, {
      conversationId: room,
      body: "Taking a short break",
    }),
  ).toEqual({ ok: true });

  await as("mod").mutation(api.chat.roomControls.set, {
    conversationId: room,
    locked: false,
  });
  expect(
    await as("member").mutation(api.chat.messages.send, {
      conversationId: room,
      body: "back again",
    }),
  ).toEqual({ ok: true });
});

test("slow mode spaces each member's messages in this room and exempts staff", async () => {
  const { as, room } = await setup();
  await as("mod").mutation(api.chat.roomControls.set, {
    conversationId: room,
    slowModeSeconds: 30,
  });
  const send = (subject: string, body: string) =>
    as(subject).mutation(api.chat.messages.send, {
      conversationId: room,
      body,
    });

  expect(await send("member", "first thought")).toEqual({ ok: true });
  vi.advanceTimersByTime(10_000);
  expect(await send("member", "second thought")).toEqual({
    ok: false,
    refusal: "slow-mode",
  });
  expect(await send("mod", "staff one")).toEqual({ ok: true });
  expect(await send("mod", "staff two")).toEqual({ ok: true });
  vi.advanceTimersByTime(21_000);
  expect(await send("member", "second thought")).toEqual({ ok: true });

  await as("mod").mutation(api.chat.roomControls.set, {
    conversationId: room,
    slowModeSeconds: 0,
  });
  vi.advanceTimersByTime(1_000);
  expect(await send("member", "third thought")).toEqual({ ok: true });
});

test("bulk delete removes the newest messages, optionally one person's, and spares senior staff", async () => {
  const { t, as, room } = await setup();
  await seed(t, room, [
    "member",
    "spammer",
    "ceo",
    "spammer",
    "member",
    "spammer",
  ]);

  expect(
    await as("mod").mutation(api.chat.roomControls.bulkDelete, {
      conversationId: room,
      count: 10,
      handle: "@spammer",
    }),
  ).toEqual({ deleted: 3, skipped: 0 });
  expect(await remaining(t, room)).toEqual(["member", "ceo", "member"]);

  expect(
    await as("mod").mutation(api.chat.roomControls.bulkDelete, {
      conversationId: room,
      count: 2,
    }),
  ).toEqual({ deleted: 1, skipped: 1 });
  expect(await remaining(t, room)).toEqual(["member", "ceo"]);

  expect(
    await as("ceo").mutation(api.chat.roomControls.bulkDelete, {
      conversationId: room,
      count: 25,
    }),
  ).toEqual({ deleted: 2, skipped: 0 });

  await expect(
    as("mod").mutation(api.chat.roomControls.bulkDelete, {
      conversationId: room,
      count: 101,
    }),
  ).rejects.toThrow("Choose between 1 and 100 messages.");
  await expect(
    as("mod").mutation(api.chat.roomControls.bulkDelete, {
      conversationId: room,
      count: 10,
      handle: "nobody",
    }),
  ).rejects.toThrow("No one goes by @nobody.");
});
