/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
const modules = import.meta.glob("../../convex/**/*.ts");

test("only published announcements are visible; reads are private and idempotent", async () => {
  const t = convexTest(schema, modules);
  const [published, draft] = await t.run(async ctx => Promise.all([
    ctx.db.insert("announcements", { title: "Hello", body: "News", status: "published" }),
    ctx.db.insert("announcements", { title: "Draft", body: "Private", status: "draft" }),
    ctx.db.insert("announcements", { title: "Old", body: "Archived", status: "archived" }),
  ]));
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  expect(await t.query(api.announcements.list, {})).toEqual([]);
  expect(await alice.query(api.announcements.list, {})).toEqual([
    { _id: published, title: "Hello", body: "News", read: false },
  ]);
  await expect(t.mutation(api.announcements.markRead, { announcementId: published })).rejects.toThrow();
  await expect(alice.mutation(api.announcements.markRead, { announcementId: draft })).rejects.toThrow();
  await alice.mutation(api.announcements.markRead, { announcementId: published });
  await alice.mutation(api.announcements.markRead, { announcementId: published });
  expect((await alice.query(api.announcements.list, {}))[0].read).toBe(true);
  expect((await bob.query(api.announcements.list, {}))[0].read).toBe(false);
  expect(await t.run(ctx => ctx.db.query("announcementReads").collect())).toHaveLength(1);
});

test("retention deletes old content and receipts while preserving the newest three", async () => {
  const { internal } = await import("../../convex/_generated/api");
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const id = await ctx.db.insert("announcements", { title: `${i}`, body: "News", status: "published" });
      ids.push(id);
      await ctx.db.insert("announcementReads", { clerkId: "alice", announcementId: id, readAt: 1 });
    }
    return ids;
  });
  const alice = t.withIdentity({ subject: "alice" });
  expect((await alice.query(api.announcements.list, {})).map(p => p._id)).toEqual(ids.slice(2).reverse());
  await t.mutation(internal.announcements.trim, {});
  await t.mutation(internal.announcements.trim, {});
  const remaining = await t.run(ctx => ctx.db.query("announcements").collect());
  const receipts = await t.run(ctx => ctx.db.query("announcementReads").collect());
  expect(remaining.map(p => p._id)).toEqual(ids.slice(2));
  expect(receipts.map(r => r.announcementId)).toEqual(ids.slice(2));
});
