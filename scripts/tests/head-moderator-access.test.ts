/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { admit } from "./invited";

/**
 * A Head Moderator holds every CEO power on the Admin page — votes, invite
 * codes, restrictions — except over CEOs themselves, and except over a peer
 * where a CEO could not act on a peer either.
 */

const modules = import.meta.glob("../../convex/**/*.ts");

beforeEach(() => {
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify({
      ceo: "ceo",
      head: "head_moderator",
      peer: "head_moderator",
      mod: "moderator",
    }),
  );
});
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  await admit(t, "ceo", "head", "peer", "mod", "member");
  return t;
}

test("a Head Moderator raises, forces, closes, and clears votes like a CEO", async () => {
  const t = await setup();
  const head = t.withIdentity({ subject: "head" });
  const mod = t.withIdentity({ subject: "mod" });
  const member = t.withIdentity({ subject: "member" });

  const id = await head.mutation(api.votes.create, {
    title: "Keep the arcade?",
    description: "",
    forced: true,
  });
  expect(await head.query(api.votes.list, {})).toMatchObject([
    { _id: id, title: "Keep the arcade?", forced: true, closed: false },
  ]);
  expect(await member.query(api.votes.pending, {})).toMatchObject([
    { _id: id },
  ]);

  await member.mutation(api.votes.cast, { topicId: id, choice: "yes" });
  expect(await head.query(api.votes.results, { topicId: id })).not.toBeNull();
  await head.mutation(api.votes.setForced, { id, forced: false });
  await head.mutation(api.votes.setClosed, { id, closed: true });
  expect(await head.query(api.votes.list, {})).toMatchObject([
    { forced: false, closed: true },
  ]);
  expect(await head.mutation(api.votes.remove, { id })).toBe(true);
  expect(await head.query(api.votes.list, {})).toEqual([]);

  for (const caller of [mod, member, t]) {
    await expect(caller.query(api.votes.list, {})).rejects.toThrow(
      "Admin access required.",
    );
    await expect(
      caller.mutation(api.votes.create, {
        title: "Nope",
        description: "",
        forced: false,
      }),
    ).rejects.toThrow("Admin access required.");
  }
});

test("a Head Moderator makes, pauses, and deletes invite codes like a CEO", async () => {
  const t = await setup();
  const head = t.withIdentity({ subject: "head" });
  const now = Date.now();

  const code = await head.mutation(api.invites.create, { note: "Friends" });
  expect(code).toMatch(/^\d{6}$/);
  const [row] = await head.query(api.invites.list, { now });
  expect(row).toMatchObject({ code, note: "Friends", createdBy: "head" });

  await head.mutation(api.invites.setDisabled, { id: row._id, disabled: true });
  expect((await head.query(api.invites.list, { now }))[0]?.disabled).toBe(true);
  await head.mutation(api.invites.remove, { id: row._id });
  expect(await head.query(api.invites.list, { now })).toEqual([]);

  for (const subject of ["mod", "member"]) {
    await expect(
      t.withIdentity({ subject }).mutation(api.invites.create, {}),
    ).rejects.toThrow("Admin access required.");
  }
});

test("a Head Moderator restricts anyone below their rank, never a CEO or a peer", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: "ceo" });
  const head = t.withIdentity({ subject: "head" });
  const banned = { kind: "banned" as const };

  // The pick list leaves out what the caller may not restrict.
  const forHead = (await head.query(api.restrictions.accounts, {})).map(
    (account) => account.clerkId,
  );
  expect(forHead.sort()).toEqual(["member", "mod"]);
  const forCeo = (await ceo.query(api.restrictions.accounts, {})).map(
    (account) => account.clerkId,
  );
  expect(forCeo.sort()).toEqual(["head", "member", "mod", "peer"]);

  expect(
    await head.mutation(api.restrictions.set, {
      clerkIds: ["member", "mod"],
      screen: banned,
    }),
  ).toBe(2);
  expect(
    (await head.query(api.restrictions.list, {}))
      .map((row) => row.clerkId)
      .sort(),
  ).toEqual(["member", "mod"]);

  for (const clerkId of ["ceo", "peer"]) {
    await expect(
      head.mutation(api.restrictions.set, {
        clerkIds: [clerkId],
        screen: banned,
      }),
    ).rejects.toThrow(
      "Only a CEO can restrict a CEO's or Head Moderator's account.",
    );
  }
  await expect(
    head.mutation(api.restrictions.set, { clerkIds: ["head"], screen: banned }),
  ).rejects.toThrow("You can't restrict your own account.");
  await expect(
    ceo.mutation(api.restrictions.set, { clerkIds: ["ceo"], screen: banned }),
  ).rejects.toThrow("You can't restrict your own account.");

  // A CEO restricts a peer; only a CEO lifts it.
  expect(
    await ceo.mutation(api.restrictions.set, {
      clerkIds: ["peer"],
      screen: banned,
    }),
  ).toBe(1);
  await expect(
    head.mutation(api.restrictions.lift, { clerkIds: ["peer"] }),
  ).rejects.toThrow("Only a CEO can lift a Head Moderator's restriction.");
  await head.mutation(api.restrictions.lift, { clerkIds: ["member", "mod"] });
  await ceo.mutation(api.restrictions.lift, { clerkIds: ["peer"] });
  expect(await ceo.query(api.restrictions.list, {})).toEqual([]);
});

test("a Head Moderator manages allowances for anyone but a CEO", async () => {
  const t = await setup();
  const head = t.withIdentity({ subject: "head" });

  expect(
    await head.mutation(api.adminQuotas.reset, {
      clerkId: "member",
      quotas: ["experience", "bot"],
    }),
  ).toEqual({ usersReset: 1, pending: false });
  await expect(
    head.mutation(api.adminQuotas.reset, { clerkId: "ceo", quotas: ["bot"] }),
  ).rejects.toThrow("Only a CEO can reset a CEO's allowances.");
  await expect(
    head.mutation(api.adminQuotas.setActivityLimit, {
      clerkId: "ceo",
      minutes: 20,
    }),
  ).rejects.toThrow("Only a CEO can change a CEO's activity time.");
});
