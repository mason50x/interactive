/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { matchesOwnName, THREE_DAYS } from "../../convex/voting/model";

const modules = import.meta.glob("../../convex/**/*.ts");
beforeEach(() => {
  vi.stubEnv("VOTING_ENABLED", "1");
  vi.stubEnv("ADMIN_CLERK_IDS", "admin");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const clerkId of ["author", "admin", "b", "c", "d", "e", "f"]) {
      await ctx.db.insert("users", {
        clerkId,
        name: clerkId === "author" ? "Alex Smith" : clerkId,
        email: `${clerkId}@example.com`,
      });
      await ctx.db.insert("chatProfiles", {
        clerkId,
        handle: clerkId,
        handleKey: clerkId,
        createdAt: Date.now(),
      });
    }
  });
  const author = t.withIdentity({ subject: "author" });
  const id = await author.mutation(api.voting.create, {
    name: "Taylor Jones",
    email: "taylor@example.com",
  });
  return { t, author, id };
}
const page = { numItems: 20, cursor: null };

test("creation counts one yes; five unique yes votes accept and require admin delivery", async () => {
  const { t, author, id } = await setup();
  expect((await t.run((ctx) => ctx.db.get(id)))?.yes).toBe(1);
  await expect(
    author.mutation(api.voting.vote, { nominationId: id, yes: true }),
  ).rejects.toThrow("already voted");
  for (const subject of ["b", "c", "d"])
    await t
      .withIdentity({ subject })
      .mutation(api.voting.vote, { nominationId: id, yes: true });
  expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("open");
  await t
    .withIdentity({ subject: "e" })
    .mutation(api.voting.vote, { nominationId: id, yes: true });
  expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
    status: "accepted",
    yes: 5,
    no: 0,
    delivery: "pending",
  });
  await expect(
    author.mutation(api.voting.reserveDelivery, { nominationId: id }),
  ).rejects.toThrow("Admin");
  expect(
    await t
      .withIdentity({ subject: "admin" })
      .mutation(api.voting.reserveDelivery, { nominationId: id }),
  ).toEqual({ email: "taylor@example.com", sent: false });
  await expect(
    t
      .withIdentity({ subject: "admin" })
      .mutation(api.voting.reserveDelivery, { nominationId: id }),
  ).rejects.toThrow("already being sent");
  await t
    .withIdentity({ subject: "admin" })
    .mutation(api.voting.confirmDelivery, {
      nominationId: id,
      clerkInvitationId: "test_invite",
    });
  expect((await t.run((ctx) => ctx.db.get(id)))?.delivery).toBe("sent");
});

test("one no immediately rejects; votes cannot be changed or added afterwards", async () => {
  const { t, id } = await setup();
  const voter = t.withIdentity({ subject: "b" });
  await voter.mutation(api.voting.vote, { nominationId: id, yes: false });
  expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
    status: "rejected",
    yes: 1,
    no: 1,
  });
  await expect(
    voter.mutation(api.voting.vote, { nominationId: id, yes: true }),
  ).rejects.toThrow("closed");
  await expect(
    t
      .withIdentity({ subject: "admin" })
      .mutation(api.voting.reserveDelivery, { nominationId: id }),
  ).rejects.toThrow("not passed");
});

test("expiry rejects after three days; a late fifth vote cannot accept", async () => {
  const { t, id } = await setup();
  for (const subject of ["b", "c", "d"])
    await t
      .withIdentity({ subject })
      .mutation(api.voting.vote, { nominationId: id, yes: true });
  vi.advanceTimersByTime(THREE_DAYS);
  await t
    .withIdentity({ subject: "e" })
    .mutation(api.voting.vote, { nominationId: id, yes: true });
  expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
    status: "rejected",
    yes: 4,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test("scheduled expiry works with no visits; accepted votes stay accepted", async () => {
  const { t, id } = await setup();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("rejected");
});

test("deletion is author/admin only, removes ballots, and preserves rejection cooldown", async () => {
  const { t, author, id } = await setup();
  await expect(
    t
      .withIdentity({ subject: "b" })
      .mutation(api.voting.remove, { nominationId: id }),
  ).rejects.toThrow("Only the author");
  await t
    .withIdentity({ subject: "b" })
    .mutation(api.voting.vote, { nominationId: id, yes: false });
  await author.mutation(api.voting.remove, { nominationId: id });
  expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
  await expect(
    author.mutation(api.voting.create, {
      name: "Taylor Jones",
      email: "taylor@example.com",
    }),
  ).rejects.toThrow("three days");
  vi.advanceTimersByTime(THREE_DAYS);
  const nextId = await author.mutation(api.voting.create, {
    name: "Taylor Jones",
    email: "taylor@example.com",
  });
  await t
    .withIdentity({ subject: "admin" })
    .mutation(api.voting.remove, { nominationId: nextId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await t.run((ctx) => ctx.db.query("nominationVotes").take(10)),
  ).toEqual([]);
});

test("emails are admin-only, voter identities visible, and unread position is per member", async () => {
  const { t, author, id } = await setup();
  const memberRows = await author.query(api.voting.list, {
    status: "open",
    paginationOpts: page,
  });
  expect(memberRows.page[0].email).toBeNull();
  const adminRows = await t
    .withIdentity({ subject: "admin" })
    .query(api.voting.list, { status: "open", paginationOpts: page });
  expect(adminRows.page[0].email).toBe("taylor@example.com");
  expect(
    (
      await author.query(api.voting.voters, {
        nominationId: id,
        paginationOpts: page,
      })
    ).page[0],
  ).toMatchObject({ name: "author", yes: true });
  expect(await author.query(api.voting.unread, {})).toBe(true);
  await author.mutation(api.voting.markRead, {
    through: memberRows.page[0].createdAt,
  });
  expect(await author.query(api.voting.unread, {})).toBe(false);
  expect(
    await t.withIdentity({ subject: "b" }).query(api.voting.unread, {}),
  ).toBe(true);
  await expect(
    t.query(api.voting.list, { status: "open", paginationOpts: page }),
  ).rejects.toThrow("Sign in");
});

test("self-name regex normalization, own email, and duplicate nominee checks", async () => {
  const { author } = await setup();
  expect(matchesOwnName("Álex-SMITH", ["Alex Smith"])).toBe(true);
  expect(matchesOwnName("Alexander Smith", ["Alex Smith"])).toBe(false);
  await expect(
    author.mutation(api.voting.create, {
      name: "ÁLEX-SMITH",
      email: "different@example.com",
    }),
  ).rejects.toThrow("yourself");
  await expect(
    author.mutation(api.voting.create, {
      name: "Different Name",
      email: "AUTHOR@example.com",
    }),
  ).rejects.toThrow("yourself");
  await expect(
    author.mutation(api.voting.create, {
      name: "TAYLOR-JONES",
      email: "different@example.com",
    }),
  ).rejects.toThrow("already has");
});

test("account cleanup removes owned nominations and ballots without changing closed totals", async () => {
  const { t, id } = await setup();
  await t
    .withIdentity({ subject: "b" })
    .mutation(api.voting.vote, { nominationId: id, yes: true });
  await t.mutation(internal.voting.purgeAccount, { clerkId: "b" });
  expect((await t.run((ctx) => ctx.db.get(id)))?.yes).toBe(1);
  await t.mutation(internal.voting.purgeAccount, { clerkId: "author" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
});

test("disabled voting rejects direct API calls, including admin delivery, and stops expiry", async () => {
  const { t, author, id } = await setup();
  for (const flag of [undefined, "0", "true"]) {
    vi.stubEnv("VOTING_ENABLED", flag);
    await expect(
      author.query(api.voting.list, { status: "open", paginationOpts: page }),
    ).rejects.toThrow("not available");
    await expect(author.query(api.voting.approvals, {})).rejects.toThrow(
      "not available",
    );
    await expect(
      author.query(api.voting.voters, {
        nominationId: id,
        paginationOpts: page,
      }),
    ).rejects.toThrow("not available");
    await expect(
      author.mutation(api.voting.create, {
        name: "Someone Else",
        email: "else@example.com",
      }),
    ).rejects.toThrow("not available");
    await expect(
      author.mutation(api.voting.vote, { nominationId: id, yes: true }),
    ).rejects.toThrow("not available");
    await expect(
      author.mutation(api.voting.remove, { nominationId: id }),
    ).rejects.toThrow("not available");
    await expect(
      author.mutation(api.voting.markRead, { through: Date.now() }),
    ).rejects.toThrow("not available");
    const admin = t.withIdentity({ subject: "admin" });
    await expect(
      admin.mutation(api.voting.reserveDelivery, { nominationId: id }),
    ).rejects.toThrow("not available");
    await expect(
      admin.mutation(api.voting.confirmDelivery, {
        nominationId: id,
        clerkInvitationId: "ignored",
      }),
    ).rejects.toThrow("not available");
    await expect(
      admin.mutation(api.voting.releaseDelivery, { nominationId: id }),
    ).rejects.toThrow("not available");
    expect(await author.query(api.voting.unread, {})).toBe(false);
  }
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("open");
});
