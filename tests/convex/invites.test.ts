import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { makeConvexTest } from "../helpers/convex";

afterEach(() => vi.useRealTimers());

/**
 * `INVITE_LIMIT` is a module constant and is currently `0`, the off switch.
 * `reserve` therefore refuses every well-formed address with `disabled`
 * before it ever counts rows, and `exhausted`/`duplicate` are unreachable
 * through the public surface. The rest of the module is exercised by seeding
 * rows in the states `reserve` would have left.
 */
const INVITE_LIMIT = 0;

function withEmail(t: ReturnType<typeof makeConvexTest>, subject: string) {
  return t.withIdentity({ subject, email: `${subject}@example.com` });
}

async function seedInvite(
  t: ReturnType<typeof makeConvexTest>,
  fields: Partial<Doc<"invites">> & { email: string },
) {
  return await t.run((ctx) =>
    ctx.db.insert("invites", {
      inviterClerkId: "alice",
      status: "sent",
      clerkInvitationId: `inv_${fields.email}`,
      ...fields,
    }),
  );
}

test("mine is null signed out and reports the allowance, floored at zero, without revoked rows", async () => {
  vi.useFakeTimers();
  const t = makeConvexTest();
  expect(await t.query(api.invites.mine, {})).toBeNull();

  const alice = withEmail(t, "alice");
  expect(await alice.query(api.invites.mine, {})).toEqual({
    limit: INVITE_LIMIT,
    remaining: 0,
    invites: [],
  });

  vi.setSystemTime(1_000);
  const sending = await seedInvite(t, {
    email: "one@example.com",
    status: "sending",
    clerkInvitationId: undefined,
  });
  vi.setSystemTime(2_000);
  const accepted = await seedInvite(t, {
    email: "two@example.com",
    status: "accepted",
    acceptedClerkId: "two",
  });
  vi.setSystemTime(3_000);
  await seedInvite(t, { email: "three@example.com", status: "revoked" });
  vi.setSystemTime(4_000);
  const sent = await seedInvite(t, { email: "four@example.com" });
  await seedInvite(t, { email: "bobs@example.com", inviterClerkId: "bob" });

  const mine = await alice.query(api.invites.mine, {});
  expect(mine?.limit).toBe(INVITE_LIMIT);
  // Three live rows against an allowance of zero: floored, not negative.
  expect(mine?.remaining).toBe(0);
  // Newest first; `sending` reads as pending; the Clerk id never leaves.
  expect(mine?.invites).toEqual([
    { id: sent, email: "four@example.com", status: "pending", sentAt: 4_000 },
    {
      id: accepted,
      email: "two@example.com",
      status: "accepted",
      sentAt: 2_000,
    },
    { id: sending, email: "one@example.com", status: "pending", sentAt: 1_000 },
  ]);
  expect(JSON.stringify(mine)).not.toContain("inv_");
});

test("reserve throws signed out and refuses typos, the caller's own address and the disabled allowance", async () => {
  const t = makeConvexTest();
  await expect(
    t.mutation(api.invites.reserve, { email: "x@example.com" }),
  ).rejects.toThrow("Not signed in");

  const alice = withEmail(t, "alice");
  for (const email of ["", "nope", "a@b", "two words@example.com", `${"a".repeat(250)}@example.com`]) {
    expect(await alice.mutation(api.invites.reserve, { email })).toEqual({
      ok: false,
      reason: "invalid_email",
    });
  }
  // Normalised before it is compared, so case and padding do not dodge it.
  expect(
    await alice.mutation(api.invites.reserve, { email: "  Alice@Example.COM " }),
  ).toEqual({ ok: false, reason: "self" });

  expect(
    await alice.mutation(api.invites.reserve, { email: "friend@example.com" }),
  ).toEqual({ ok: false, reason: "disabled" });
  // The switch is checked before the address is, so an address already
  // invited by somebody else reads as disabled too, not as a duplicate.
  await seedInvite(t, { email: "taken@example.com", inviterClerkId: "bob" });
  expect(
    await alice.mutation(api.invites.reserve, { email: "taken@example.com" }),
  ).toEqual({ ok: false, reason: "disabled" });
  // Nothing was written.
  expect(await t.run((ctx) => ctx.db.query("invites").collect())).toHaveLength(
    1,
  );
});

test("confirm turns the caller's own reservation into a sent invitation, once", async () => {
  const t = makeConvexTest();
  const alice = withEmail(t, "alice");
  const bob = withEmail(t, "bob");
  const id = await seedInvite(t, {
    email: "friend@example.com",
    status: "sending",
    clerkInvitationId: undefined,
  });

  await expect(
    t.mutation(api.invites.confirm, { inviteId: id, clerkInvitationId: "x" }),
  ).rejects.toThrow("Not signed in");
  // Not bob's to confirm.
  expect(
    await bob.mutation(api.invites.confirm, {
      inviteId: id,
      clerkInvitationId: "inv_bob",
    }),
  ).toBeNull();
  expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("sending");

  expect(
    await alice.mutation(api.invites.confirm, {
      inviteId: id,
      clerkInvitationId: "inv_123",
    }),
  ).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
    status: "sent",
    clerkInvitationId: "inv_123",
  });
  // A second confirm does not overwrite the handle.
  await alice.mutation(api.invites.confirm, {
    inviteId: id,
    clerkInvitationId: "inv_456",
  });
  expect((await t.run((ctx) => ctx.db.get(id)))?.clerkInvitationId).toBe(
    "inv_123",
  );
});

test("release deletes only the caller's own reservation and hands the credit back", async () => {
  const t = makeConvexTest();
  const alice = withEmail(t, "alice");
  const bob = withEmail(t, "bob");
  const reserved = await seedInvite(t, {
    email: "friend@example.com",
    status: "sending",
    clerkInvitationId: undefined,
  });
  const sent = await seedInvite(t, { email: "other@example.com" });

  expect(
    (await alice.query(api.invites.mine, {}))?.invites.map((i) => i.email),
  ).toEqual(["other@example.com", "friend@example.com"]);

  await bob.mutation(api.invites.release, { inviteId: reserved });
  expect(await t.run((ctx) => ctx.db.get(reserved))).not.toBeNull();

  // Only a reservation can be released; a sent invitation is revoked instead.
  expect(
    await alice.mutation(api.invites.release, { inviteId: sent }),
  ).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(sent))).not.toBeNull();

  expect(
    await alice.mutation(api.invites.release, { inviteId: reserved }),
  ).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(reserved))).toBeNull();
  expect(
    (await alice.query(api.invites.mine, {}))?.invites.map((i) => i.email),
  ).toEqual(["other@example.com"]);
  // Releasing again is a no-op.
  expect(
    await alice.mutation(api.invites.release, { inviteId: reserved }),
  ).toBeNull();
});

test("revocable hands out the Clerk id for the caller's sent invitations only", async () => {
  const t = makeConvexTest();
  const alice = withEmail(t, "alice");
  const bob = withEmail(t, "bob");
  const sent = await seedInvite(t, { email: "a@example.com" });
  const sending = await seedInvite(t, {
    email: "b@example.com",
    status: "sending",
    clerkInvitationId: undefined,
  });
  const accepted = await seedInvite(t, {
    email: "c@example.com",
    status: "accepted",
  });
  const revoked = await seedInvite(t, {
    email: "d@example.com",
    status: "revoked",
  });
  const noHandle = await seedInvite(t, {
    email: "e@example.com",
    clerkInvitationId: undefined,
  });

  await expect(
    t.query(api.invites.revocable, { inviteId: sent }),
  ).rejects.toThrow("Not signed in");
  expect(await bob.query(api.invites.revocable, { inviteId: sent })).toBeNull();
  expect(await alice.query(api.invites.revocable, { inviteId: sent })).toEqual(
    { clerkInvitationId: "inv_a@example.com" },
  );
  for (const id of [sending, accepted, revoked]) {
    expect(await alice.query(api.invites.revocable, { inviteId: id })).toBeNull();
  }
  // Sent but with no handle recorded: revocable, with nothing to revoke at Clerk.
  expect(
    await alice.query(api.invites.revocable, { inviteId: noHandle }),
  ).toEqual({ clerkInvitationId: null });
});

test("markRevoked refunds the credit for anything the caller owns except an accepted invitation", async () => {
  const t = makeConvexTest();
  const alice = withEmail(t, "alice");
  const bob = withEmail(t, "bob");
  const sent = await seedInvite(t, { email: "a@example.com" });
  const sending = await seedInvite(t, {
    email: "b@example.com",
    status: "sending",
  });
  const accepted = await seedInvite(t, {
    email: "c@example.com",
    status: "accepted",
  });

  await bob.mutation(api.invites.markRevoked, { inviteId: sent });
  expect((await t.run((ctx) => ctx.db.get(sent)))?.status).toBe("sent");

  for (const id of [sent, sending, accepted]) {
    expect(
      await alice.mutation(api.invites.markRevoked, { inviteId: id }),
    ).toBeNull();
  }
  const statuses = await t.run(async (ctx) => [
    (await ctx.db.get(sent))?.status,
    (await ctx.db.get(sending))?.status,
    (await ctx.db.get(accepted))?.status,
  ]);
  expect(statuses).toEqual(["revoked", "revoked", "accepted"]);
  // Revoked rows leave the list; the accepted one stays.
  expect(
    (await alice.query(api.invites.mine, {}))?.invites.map((i) => i.email),
  ).toEqual(["c@example.com"]);
});

test("markAccepted matches on the normalised address and only moves live rows", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  const t = makeConvexTest();
  const sent = await seedInvite(t, { email: "new@example.com" });
  const sending = await seedInvite(t, {
    email: "new@example.com",
    status: "sending",
    inviterClerkId: "bob",
  });
  const revoked = await seedInvite(t, {
    email: "new@example.com",
    status: "revoked",
  });
  const other = await seedInvite(t, { email: "other@example.com" });

  // The webhook path: `http.ts` calls this with the primary email and the
  // new user's Clerk id.
  expect(
    await t.mutation(internal.invites.markAccepted, {
      email: "  New@Example.COM ",
      clerkId: "user_new",
    }),
  ).toEqual({ accepted: 2 });

  for (const id of [sent, sending]) {
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: "accepted",
      acceptedClerkId: "user_new",
      acceptedAt: Date.now(),
    });
  }
  expect((await t.run((ctx) => ctx.db.get(revoked)))?.status).toBe("revoked");
  const untouched = await t.run((ctx) => ctx.db.get(other));
  expect(untouched?.status).toBe("sent");
  expect(untouched?.acceptedClerkId).toBeUndefined();

  // Replaying the webhook finds nothing left to move.
  expect(
    await t.mutation(internal.invites.markAccepted, {
      email: "new@example.com",
      clerkId: "user_new",
    }),
  ).toEqual({ accepted: 0 });
  // An address nobody invited is not an error.
  expect(
    await t.mutation(internal.invites.markAccepted, {
      email: "stranger@example.com",
      clerkId: "user_x",
    }),
  ).toEqual({ accepted: 0 });
});
