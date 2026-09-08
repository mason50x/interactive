/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { profileByHandle } from "../../convex/chat/shared";
const modules = import.meta.glob("../../convex/**/*.ts");

test("Clerk cutover preserves profile identity, history and privacy; repeat sync preserves avatar choice", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run(ctx => ctx.db.insert("chatProfiles", {
    clerkId: "account", handle: "old_handle", handleKey: "oldhandle", displayName: "Old Name",
    createdAt: 123, messagesSent: 42, dmPolicy: "nobody", discoverable: false, avatarEmoji: "🐱",
  }));
  const data = { id: "account", username: "Real-Username", first_name: "First", last_name: "Private", image_url: "https://img.clerk.com/example", updated_at: 10 };
  await t.mutation(internal.users.upsertFromClerk, { data });
  const mine = t.withIdentity({ subject: "account" });
  expect(await mine.query(api.chat.profiles.mine, {})).toMatchObject({
    handle: "Real-Username", displayName: "First", avatarUrl: data.image_url, avatarMode: "account", createdAt: 123,
    messagesSent: 42, dmPolicy: "nobody", discoverable: false,
  });
  expect(await t.run(ctx => profileByHandle(ctx, "real-username"))).toMatchObject({ _id: id });
  expect(await t.run(ctx => profileByHandle(ctx, "old_handle"))).toBeNull();
  await mine.mutation(api.chat.profiles.setAvatar, { mode: "custom", initials: "AB", hue: 30 });
  await t.mutation(internal.users.upsertFromClerk, { data: { ...data, username: "NewName", first_name: "New", updated_at: 20 } });
  expect(await mine.query(api.chat.profiles.mine, {})).toMatchObject({ handle: "NewName", displayName: "New", avatarMode: "custom", avatarInitials: "AB" });
  expect((await mine.query(api.chat.profiles.mine, {}))?.avatarUrl).toBeUndefined();
  // Old webhook delivery and old JWT sync cannot overwrite the authoritative update.
  await t.mutation(internal.users.upsertFromClerk, { data });
  await mine.mutation(api.users.store, {});
  expect((await mine.query(api.chat.profiles.mine, {}))?.handle).toBe("NewName");
  await mine.mutation(api.chat.profiles.setAvatar, { mode: "account" });
  expect((await mine.query(api.chat.profiles.mine, {}))?.avatarUrl).toBe(data.image_url);
  expect(await mine.mutation(api.chat.attachments.uploadUrl, { purpose: "avatar" })).toEqual({ ok: false, refusal: "image" });
});

test("new account receives one profile and global membership; Clerk identities do not use confusable folding", async () => {
  const t = convexTest(schema, modules);
  for (const [id, username] of [["one", "alice"], ["two", "al1ce"]]) {
    const data = { id, username, first_name: "First", updated_at: 1 };
    await t.mutation(internal.users.upsertFromClerk, { data });
    await t.mutation(internal.users.upsertFromClerk, { data });
  }
  const rows = await t.run(async ctx => ({
    profiles: await ctx.db.query("chatProfiles").take(10), members: await ctx.db.query("conversationMembers").take(10),
    one: await profileByHandle(ctx, "alice"), two: await profileByHandle(ctx, "al1ce"),
  }));
  expect(rows.profiles).toHaveLength(2);
  expect(rows.members).toHaveLength(4);
  expect(rows.members.filter(member => member.kind === "global")).toHaveLength(2);
  expect(rows.members.filter(member => member.dmPeer === "bot")).toHaveLength(2);
  expect(rows.one?.clerkId).toBe("one"); expect(rows.two?.clerkId).toBe("two");
  await expect(t.action(api.accountSync.mine, {})).rejects.toThrow("Not signed in");
});

test("messages keep their ids and show the current Clerk identity after rename", async () => {
  const t = convexTest(schema, modules);
  const account = { id: "sender", username: "before", first_name: "Before", image_url: "https://img.clerk.com/test", updated_at: 1 };
  await t.mutation(internal.users.upsertFromClerk, { data: account });
  const room = await t.run(async ctx => {
    const profile = await ctx.db.query("chatProfiles").withIndex("byClerkId", q => q.eq("clerkId", "sender")).unique();
    await ctx.db.patch(profile!._id, { createdAt: Date.now() - 86400000 });
    return (await ctx.db.query("conversations").withIndex("byKind", q => q.eq("kind", "global")).first())!._id;
  });
  const sender = t.withIdentity({ subject: "sender" });
  const sent = await sender.mutation(api.chat.messages.send, { conversationId: room, body: "A sunny day for learning." });
  expect(sent.ok).toBe(true);
  const args = { conversationId: room, dayStart: 0, dayEnd: Date.now() + 10000, paginationOpts: { cursor: null, numItems: 20 } };
  const before = (await sender.query(api.chat.messages.list, args)).page;
  await t.mutation(internal.users.upsertFromClerk, { data: { ...account, username: "after", first_name: "After", updated_at: 2 } });
  const after = (await sender.query(api.chat.messages.list, args)).page;
  expect(after[0]._id).toBe(before[0]._id);
  expect(after[0]).toMatchObject({ authorHandle: "after", authorName: "After", authorAvatarUrl: account.image_url, body: "A sunny day for learning." });
});

test("first names are formatted and collisions use the shortest available surname prefix", async () => {
  const t = convexTest(schema, modules);
  const accounts = [
    { id: "a", username: "mason-a", first_name: "  MASON  ", last_name: "SINGEL" },
    { id: "b", username: "mason-b", first_name: "mason", last_name: "SMITH" },
    { id: "c", username: "mason-c", first_name: "MaSoN", last_name: "SMITH" },
    { id: "d", username: "mason-d", first_name: "MASON", last_name: "Smith" },
    { id: "e", username: "mason-e", first_name: "mason", last_name: "Smith" },
    { id: "f", username: "mason-f", first_name: "mason", last_name: "Smith" },
    { id: "g", username: "mason-g", first_name: "mason", last_name: "Smith" },
    { id: "h", username: "henry", first_name: "HENRY", last_name: "Other" },
  ];
  for (const data of accounts) await t.mutation(internal.users.upsertFromClerk, { data });
  const names = async () => (await t.run(ctx => ctx.db.query("chatProfiles").take(20))).map(p => p.displayName);
  expect(await names()).toEqual(["Mason", "Mason S", "Mason Sm", "Mason Smi", "Mason Smit", "Mason Smith", "Mason (@mason-g)", "Henry"]);
  for (const data of accounts) await t.mutation(internal.users.upsertFromClerk, { data });
  expect(await names()).toEqual(["Mason", "Mason S", "Mason Sm", "Mason Smi", "Mason Smit", "Mason Smith", "Mason (@mason-g)", "Henry"]);
});

test("sync automatically rejoins Everyone for an existing account without duplicating membership", async () => {
  const t = convexTest(schema, modules);
  const data = { id: "returning", username: "returning", first_name: "RETURNING" };
  await t.mutation(internal.users.upsertFromClerk, { data });
  const memberId = await t.run(async ctx => {
    const members = await ctx.db.query("conversationMembers").take(10);
    const member = members.find(row => row.kind === "global")!;
    await ctx.db.patch(member._id, { status: "left" });
    return member._id;
  });
  await t.mutation(internal.users.upsertFromClerk, { data });
  expect(await t.run(ctx => ctx.db.get(memberId))).toMatchObject({ status: "active" });
  expect((await t.run(ctx => ctx.db.query("conversationMembers").take(10))).filter(row => row.kind === "global")).toHaveLength(1);
});
