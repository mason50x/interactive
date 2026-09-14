import { afterEach, expect, test, vi } from "vitest";
import { BOT_ID } from "@config/bot";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { MAX_REPORTS_PER_DAY, REPORTS_TO_HIDE } from "@convex/moderation/limits";
import {
  actor,
  makeConvexTest,
  seedChatPair,
  seedChatProfiles,
} from "../helpers/convex";

afterEach(() => vi.useRealTimers());

const page = { numItems: 20, cursor: null };
const day = { dayStart: 0, dayEnd: Number.MAX_SAFE_INTEGER };

/**
 * Five members of Everyone and one stranger with a handle but no seat. Bob
 * has said something that names alice, so there is a mention row to clear.
 */
async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  const t = makeConvexTest({ rateLimited: true });
  const pair = await seedChatPair(t);
  const extra = ["carol", "dave", "erin", "stranger"] as const;
  await seedChatProfiles(t, extra);
  const [carol, dave, erin, stranger] = extra.map((id) => actor(t, id));
  for (const who of [carol, dave, erin]) {
    await who.mutation(api.chat.profiles.joinGlobal, {});
  }
  expect(
    await pair.bob.mutation(api.chat.messages.send, {
      conversationId: pair.global,
      body: "@alice you should see this",
    }),
  ).toEqual({ ok: true });
  const message = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("byConversation", (q) => q.eq("conversationId", pair.global))
      .unique(),
  );
  return {
    t,
    carol,
    dave,
    erin,
    stranger,
    messageId: message!._id,
    ...pair,
  };
}

async function reports(t: ReturnType<typeof makeConvexTest>) {
  return await t.run((ctx) => ctx.db.query("reports").collect());
}

test("self, the bot, unknown targets, non-members and no profile are refused", async () => {
  const { t, alice, bob, stranger, messageId, dm } = await setup();
  expect(
    await actor(t, "ghost").mutation(api.chat.reports.report, {
      targetClerkId: "bob",
      reason: "spam",
    }),
  ).toEqual({ ok: false, reason: "no-profile" });
  expect(
    await alice.mutation(api.chat.reports.report, {
      targetClerkId: "alice",
      reason: "spam",
    }),
  ).toEqual({ ok: false, reason: "self" });
  // The author of a message cannot report it, whatever target they name.
  expect(
    await bob.mutation(api.chat.reports.report, {
      messageId,
      targetClerkId: "alice",
      reason: "abuse",
    }),
  ).toEqual({ ok: false, reason: "self" });
  expect(
    await alice.mutation(api.chat.reports.report, {
      targetClerkId: BOT_ID,
      reason: "other",
    }),
  ).toEqual({ ok: false, reason: "unknown" });
  expect(
    await alice.mutation(api.chat.reports.report, {
      targetClerkId: "nobody",
      reason: "other",
    }),
  ).toEqual({ ok: false, reason: "unknown" });
  // Somebody the message was never shown to.
  expect(
    await stranger.mutation(api.chat.reports.report, {
      messageId,
      targetClerkId: "bob",
      reason: "abuse",
    }),
  ).toEqual({ ok: false, reason: "unknown" });

  // A message written by the bot is not reportable either.
  const botMessage = await t.run((ctx) =>
    ctx.db.insert("messages", {
      conversationId: dm,
      authorClerkId: BOT_ID,
      authorHandle: "bot",
      body: "Good morning.",
      status: "visible",
      flags: [],
    }),
  );
  expect(
    await alice.mutation(api.chat.reports.report, {
      messageId: botMessage,
      targetClerkId: BOT_ID,
      reason: "other",
    }),
  ).toEqual({ ok: false, reason: "unknown" });
  // A message that no longer exists.
  await t.run((ctx) => ctx.db.delete(botMessage));
  expect(
    await alice.mutation(api.chat.reports.report, {
      messageId: botMessage,
      targetClerkId: "bob",
      reason: "other",
    }),
  ).toEqual({ ok: false, reason: "unknown" });
  expect(await reports(t)).toEqual([]);
});

test("a message report records the author and room from the message, not the arguments", async () => {
  const { t, alice, global, messageId } = await setup();
  const other = await t.run((ctx) =>
    ctx.db.insert("conversations", {
      kind: "group",
      title: "Elsewhere",
      createdBy: "carol",
      createdAt: Date.now(),
    }),
  );
  expect(
    await alice.mutation(api.chat.reports.report, {
      messageId,
      targetClerkId: "carol",
      conversationId: other,
      reason: "harassment",
    }),
  ).toEqual({ ok: true, recorded: false });
  const rows = await reports(t);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    reporterClerkId: "alice",
    messageId,
    targetClerkId: "bob",
    conversationId: global,
    reason: "harassment",
    createdAt: Date.now(),
  });
});

test("the same reporter cannot report the same message twice", async () => {
  const { t, alice, messageId } = await setup();
  expect(
    await alice.mutation(api.chat.reports.report, {
      messageId,
      targetClerkId: "bob",
      reason: "spam",
    }),
  ).toEqual({ ok: true, recorded: false });
  expect(
    await alice.mutation(api.chat.reports.report, {
      messageId,
      targetClerkId: "bob",
      reason: "abuse",
    }),
  ).toEqual({ ok: false, reason: "already" });
  expect(await reports(t)).toHaveLength(1);
  // Account-level reports have no message to be a duplicate of.
  expect(
    await alice.mutation(api.chat.reports.report, {
      targetClerkId: "bob",
      reason: "spam",
    }),
  ).toEqual({ ok: true, recorded: true });
  expect(
    await alice.mutation(api.chat.reports.report, {
      targetClerkId: "bob",
      reason: "spam",
    }),
  ).toEqual({ ok: true, recorded: true });
  expect(await reports(t)).toHaveLength(3);
});

test("MAX_REPORTS_PER_DAY is a rolling 24-hour cap per reporter", async () => {
  const { t, alice, bob } = await setup();
  const t0 = Date.now();
  for (let i = 0; i < MAX_REPORTS_PER_DAY; i++) {
    vi.setSystemTime(t0 + i * 60_000);
    expect(
      await alice.mutation(api.chat.reports.report, {
        targetClerkId: "bob",
        reason: "spam",
      }),
    ).toEqual({ ok: true, recorded: true });
  }
  expect(
    await alice.mutation(api.chat.reports.report, {
      targetClerkId: "carol",
      reason: "spam",
    }),
  ).toEqual({ ok: false, reason: "too-many" });
  // Another account's allowance is its own.
  expect(
    await bob.mutation(api.chat.reports.report, {
      targetClerkId: "carol",
      reason: "spam",
    }),
  ).toEqual({ ok: true, recorded: true });

  // A day and a bit after the first report, one slot comes back.
  vi.setSystemTime(t0 + 86_400_000 + 1);
  expect(
    await alice.mutation(api.chat.reports.report, {
      targetClerkId: "carol",
      reason: "spam",
    }),
  ).toEqual({ ok: true, recorded: true });
  expect(
    await alice.mutation(api.chat.reports.report, {
      targetClerkId: "carol",
      reason: "spam",
    }),
  ).toEqual({ ok: false, reason: "too-many" });
  expect(await reports(t)).toHaveLength(MAX_REPORTS_PER_DAY + 2);
});

test("REPORTS_TO_HIDE distinct reporters hide the message and clear its mention rows", async () => {
  const { t, alice, carol, dave, erin, global, messageId } = await setup();
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("mentions")
        .withIndex("byMessage", (q) => q.eq("messageId", messageId))
        .collect(),
    ),
  ).toHaveLength(1);
  expect(
    (await alice.query(api.chat.conversations.list, {}))[0],
  ).toMatchObject({ kind: "global", unread: 1, mentioned: true });

  const reporters = [carol, dave, erin];
  expect(reporters.length).toBe(REPORTS_TO_HIDE);
  for (const [index, who] of reporters.entries()) {
    const last = index === reporters.length - 1;
    expect(
      await who.mutation(api.chat.reports.report, {
        messageId,
        targetClerkId: "bob",
        reason: "abuse",
      }),
    ).toEqual({ ok: true, recorded: last });
    expect((await t.run((ctx) => ctx.db.get(messageId)))?.status).toBe(
      last ? "hidden" : "visible",
    );
  }

  expect(
    await t.run((ctx) =>
      ctx.db
        .query("mentions")
        .withIndex("byMessage", (q) => q.eq("messageId", messageId))
        .collect(),
    ),
  ).toEqual([]);
  // The message's own record of what it said is untouched.
  expect((await t.run((ctx) => ctx.db.get(messageId)))?.mentions).toEqual([
    { clerkId: "alice", handle: "alice" },
  ]);
  // The gap stays in the thread with its body emptied, and alice's list no
  // longer says she was named.
  const thread = await alice.query(api.chat.messages.list, {
    conversationId: global,
    ...day,
    paginationOpts: page,
  });
  expect(thread.page.map((m) => [m.status, m.body, m.mentions])).toEqual([
    ["hidden", "", []],
  ]);
  expect(
    (await alice.query(api.chat.conversations.list, {}))[0],
  ).toMatchObject({ kind: "global", mentioned: false });

  // A fourth report on a hidden message is filed but changes nothing more.
  expect(
    await alice.mutation(api.chat.reports.report, {
      messageId,
      targetClerkId: "bob",
      reason: "abuse",
    }),
  ).toEqual({ ok: true, recorded: false });
  expect(await reports(t)).toHaveLength(REPORTS_TO_HIDE + 1);
});

test("reports never touch the author's ability to send", async () => {
  const { t, bob, carol, dave, erin, global, messageId } = await setup();
  for (const who of [carol, dave, erin]) {
    await who.mutation(api.chat.reports.report, {
      messageId,
      targetClerkId: "bob",
      reason: "abuse",
    });
  }
  vi.setSystemTime(Date.now() + 60_000);
  expect(
    await bob.mutation(api.chat.messages.send, {
      conversationId: global,
      body: "Still here",
    }),
  ).toEqual({ ok: true });
  const visible = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("byAuthor", (q) => q.eq("authorClerkId", "bob"))
      .collect(),
  );
  expect(visible.map((m) => m.status).sort()).toEqual(["hidden", "visible"]);
  expect(messageId satisfies Id<"messages">).toBeDefined();
});
