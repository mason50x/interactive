/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { admit } from "./invited";

/**
 * A Head Moderator holds the CEO powers on the Admin page except over CEOs
 * themselves; invite codes and role changes stay a CEO's alone. A Co-Owner is
 * a Head Moderator with its own badge: the same powers, and the same limits.
 */

const modules = import.meta.glob("../../convex/**/*.ts");

beforeEach(() => {
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify({
      ceo: "ceo",
      head: "head_moderator",
      peer: "head_moderator",
      owner: "co_owner",
      mod: "moderator",
    }),
  );
});
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  await admit(t, "ceo", "head", "peer", "owner", "mod", "member");
  return t;
}

test.each(["head", "owner"])(
  "%s raises, forces, closes, and clears votes like a CEO",
  async (subject) => {
    const t = await setup();
    const head = t.withIdentity({ subject });
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
  },
);

test("only a CEO makes, lists, pauses, or deletes invite codes", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: "ceo" });
  const now = Date.now();

  const code = await ceo.mutation(api.invites.create, { note: "Friends" });
  expect(code).toMatch(/^\d{6}$/);
  const [row] = await ceo.query(api.invites.list, { now });
  expect(row).toMatchObject({ code, note: "Friends", createdBy: "ceo" });

  for (const subject of ["head", "owner", "mod", "member"]) {
    const caller = t.withIdentity({ subject });
    await expect(caller.mutation(api.invites.create, {})).rejects.toThrow(
      "CEO access required.",
    );
    await expect(caller.query(api.invites.list, { now })).rejects.toThrow(
      "CEO access required.",
    );
    await expect(
      caller.mutation(api.invites.setDisabled, { id: row._id, disabled: true }),
    ).rejects.toThrow("CEO access required.");
    await expect(
      caller.mutation(api.invites.remove, { id: row._id }),
    ).rejects.toThrow("CEO access required.");
  }

  await ceo.mutation(api.invites.remove, { id: row._id });
  expect(await ceo.query(api.invites.list, { now })).toEqual([]);
});

test("Head Moderators and Co-Owners never change a role; a CEO grants Co-Owner", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: "ceo" });

  for (const subject of ["head", "owner"]) {
    const caller = t.withIdentity({ subject });
    for (const clerkId of ["member", "mod", "peer", "owner", "head", "ceo"]) {
      await expect(
        caller.mutation(api.adminQuotas.setRole, { clerkId, role: "builder" }),
      ).rejects.toThrow("Only a CEO can change roles.");
    }
    const { page } = await caller.query(api.timeouts.users, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    for (const user of page) {
      expect(user).toMatchObject({
        canChangeRole: false,
        roleLock: "Only a CEO can change roles.",
      });
    }
  }

  expect(
    await ceo.mutation(api.adminQuotas.setRole, {
      clerkId: "member",
      role: "co_owner",
    }),
  ).toEqual({ clerkId: "member", role: "co_owner" });
  const member = t.withIdentity({ subject: "member" });
  expect(await member.query(api.timeouts.access, {})).toBe("co_owner");
  expect(await member.query(api.adminQuotas.access, {})).toBe(true);
  expect(await member.query(api.chat.admin.roles, {})).toContainEqual({
    clerkId: "member",
    role: "co_owner",
  });
});

test("a Head Moderator or Co-Owner manages allowances for anyone but a CEO", async () => {
  const t = await setup();
  for (const subject of ["head", "owner"]) {
    const head = t.withIdentity({ subject });

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
  }
});
