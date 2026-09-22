/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { list } from "../../convex/chat/messages";
import { list as conversationList } from "../../convex/chat/conversations";
import type { Id } from "../../convex/_generated/dataModel";
import type { QueryCtx } from "../../convex/_generated/server";

const modules = import.meta.glob("../../convex/**/*.ts");

for (const inPage of [true, false]) {
  test(`reply lookup reuse, visibility and membership (original in page: ${inPage})`, async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const room = await ctx.db.insert("conversations", {
        kind: "global",
        createdBy: "alice",
        createdAt: Date.now(),
      });
      await ctx.db.insert("users", {
        clerkId: "alice",
        username: "alice",
        usernameKey: "alice",
        clerkCreatedAt: Date.now(),
      });
      await ctx.db.insert("conversationMembers", {
        conversationId: room,
        clerkId: "alice",
        kind: "global",
        role: "member",
        status: "active",
        joinedAt: Date.now(),
        lastReadAt: 0,
      });
      const message = {
        conversationId: room,
        authorClerkId: "alice",
        authorHandle: "alice",
        body: "Original text",
        status: "visible" as const,
        flags: [],
      };
      const original = await ctx.db.insert("messages", message);
      for (let i = 0; i < 9; i++) {
        await ctx.db.insert("messages", {
          ...message,
          body: "Reply",
          replyToId: original,
        });
      }
      return { room, original };
    });
    const args = {
      conversationId: ids.room,
      dayStart: 0,
      dayEnd: Date.now() + 10000,
      paginationOpts: { numItems: inPage ? 10 : 9, cursor: null },
    };
    const alice = t.withIdentity({ subject: "alice" });
    // Exercise the real handler and database, counting only extra db.get reads.
    const measured = await alice.run(async (ctx) => {
      const gets: string[] = [];
      let userQueries = 0;
      const db = new Proxy(ctx.db, {
        get(target, property) {
          if (property === "query")
            return (table: Parameters<typeof target.query>[0]) => {
              if (table === "users") userQueries += 1;
              return target.query(table);
            };
          if (property === "get")
            return async (id: Id<"messages">) => {
              gets.push(id);
              return await target.get(id);
            };
          return Reflect.get(target, property);
        },
      });
      const handler = (
        list as unknown as {
          _handler: (
            ctx: QueryCtx,
            input: typeof args,
          ) => ReturnType<typeof alice.query<typeof api.chat.messages.list>>;
        }
      )._handler;
      const result = await handler({ ...ctx, db }, args);
      return {
        result,
        reads: gets.filter((id) => id === ids.original).length,
        userQueries,
      };
    });
    expect(measured.reads).toBe(inPage ? 0 : 1);
    // The caller, all message authors and all quoted authors are the same
    // person. One authenticated account read serves the entire page.
    expect(measured.userQueries).toBe(1);
    expect(
      measured.result.page.filter(
        (m) => m.replyTo?.preview === "Original text",
      ),
    ).toHaveLength(9);
    expect((await t.query(api.chat.messages.list, args)).page).toEqual([]);
    expect(
      (
        await t
          .withIdentity({ subject: "outsider" })
          .query(api.chat.messages.list, args)
      ).page,
    ).toEqual([]);

    await t.run((ctx) => ctx.db.patch(ids.original, { status: "hidden" }));
    let page = (await alice.query(api.chat.messages.list, args)).page;
    expect(page.filter((m) => m.replyTo?.unavailable)).toHaveLength(9);
    expect(page.every((m) => !m.replyTo?.preview)).toBe(true);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.original, {
        status: "visible",
        authorClerkId: "bob",
      });
    });
    page = (await alice.query(api.chat.messages.list, args)).page;
    expect(page.filter((m) => m.replyTo?.preview)).toHaveLength(9);
    await t.run(async (ctx) => {
      const other = await ctx.db.insert("conversations", {
        kind: "group",
        createdBy: "alice",
        createdAt: Date.now(),
      });
      await ctx.db.patch(ids.original, {
        authorClerkId: "alice",
        conversationId: other,
      });
    });
    page = (await alice.query(api.chat.messages.list, args)).page;
    expect(page.filter((m) => m.replyTo?.unavailable)).toHaveLength(9);
    await t.run((ctx) => ctx.db.delete(ids.original));
    page = (await alice.query(api.chat.messages.list, args)).page;
    expect(page.filter((m) => m.replyTo?.unavailable)).toHaveLength(9);
  });
}

test("conversation unread count and first unread target share a single indexed scan", async () => {
  const t = convexTest(schema, modules);
  const room = await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      clerkId: "alice",
      username: "alice",
      usernameKey: "alice",
    });
    const conversationId = await ctx.db.insert("conversations", {
      kind: "group",
      createdBy: "alice",
      createdAt: Date.now(),
    });
    await ctx.db.insert("conversationMembers", {
      conversationId,
      clerkId: "alice",
      kind: "group",
      role: "member",
      status: "active",
      joinedAt: 0,
      lastReadAt: 0,
    });
    for (const body of ["First", "Second"])
      await ctx.db.insert("messages", {
        conversationId,
        authorClerkId: "bob",
        authorHandle: "bob",
        body,
        flags: [],
        status: "visible",
      });
    return conversationId;
  });
  const alice = t.withIdentity({ subject: "alice" });
  const measure = () =>
    alice.run(async (ctx) => {
      let messageQueries = 0;
      const db = new Proxy(ctx.db, {
        get(target, property) {
          if (property === "query")
            return (table: Parameters<typeof target.query>[0]) => {
              if (table === "messages") messageQueries += 1;
              return target.query(table);
            };
          return Reflect.get(target, property);
        },
      });
      const handler = (
        conversationList as unknown as {
          _handler: (
            ctx: QueryCtx,
            args: Record<string, never>,
          ) => ReturnType<
            typeof alice.query<typeof api.chat.conversations.list>
          >;
        }
      )._handler;
      return { rows: await handler({ ...ctx, db }, {}), messageQueries };
    });
  const unread = await measure();
  expect(unread.messageQueries).toBe(2); // latest + unread range, no duplicate first-row lookup
  expect(unread.rows[0].unread).toBe(2);
  expect(unread.rows[0].firstUnreadMessageId).toBeDefined();
  await alice.mutation(api.chat.conversations.markRead, {
    conversationId: room,
  });
  const read = await measure();
  expect(read.messageQueries).toBe(1); // latest alone proves everything is read
  expect(read.rows[0].unread).toBe(0);
});
