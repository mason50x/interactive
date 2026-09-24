/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify({ ceo: "ceo", mod: "moderator", builder: "builder" }),
  );
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  for (const id of ["ceo", "mod", "builder", "member"]) {
    await t.mutation(internal.users.upsertFromClerk, {
      data: { id, username: id, updated_at: 1 },
    });
  }
  return t;
}

const kinds = async (t: Awaited<ReturnType<typeof setup>>, subject: string) =>
  (
    await t.withIdentity({ subject }).query(api.chat.conversations.list, {})
  ).map((row) => row.kind);

test("Everyone above member sits in Admins, just below Announcements", async () => {
  const t = await setup();
  for (const id of ["ceo", "mod", "builder"]) {
    expect(await kinds(t, id)).toEqual([
      "global",
      "announcements",
      "admins",
      "dm",
    ]);
  }
  expect(await kinds(t, "member")).toEqual(["global", "announcements", "dm"]);
});

test("Members cannot read or post in Admins", async () => {
  const t = await setup();
  const admins = (
    await t
      .withIdentity({ subject: "mod" })
      .query(api.chat.conversations.list, {})
  ).find((row) => row.kind === "admins")!;
  expect(
    await t.withIdentity({ subject: "mod" }).mutation(api.chat.messages.send, {
      conversationId: admins._id,
      body: "Staff only",
    }),
  ).toMatchObject({ ok: true });

  const member = t.withIdentity({ subject: "member" });
  expect(
    await member.query(api.chat.conversations.get, {
      conversationId: admins._id,
    }),
  ).toBeNull();
  expect(
    (
      await member.query(api.chat.messages.list, {
        conversationId: admins._id,
        dayStart: 0,
        dayEnd: Date.now() + 1,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page,
  ).toEqual([]);
  expect(
    await member.mutation(api.chat.messages.send, {
      conversationId: admins._id,
      body: "Let me in",
    }),
  ).toMatchObject({ ok: false });
});

test("Role changes add and remove the Admins seat straight away", async () => {
  const t = await setup();
  const ceo = t.withIdentity({ subject: "ceo" });

  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: "member",
    role: "builder",
  });
  expect(await kinds(t, "member")).toContain("admins");

  await ceo.mutation(api.adminQuotas.setRole, {
    clerkId: "member",
    role: "member",
  });
  expect(await kinds(t, "member")).not.toContain("admins");

  // A demotion that only changed the env map is enforced before any sync.
  vi.stubEnv("STAFF_ROLES", JSON.stringify({ ceo: "ceo", mod: "moderator" }));
  expect(await kinds(t, "builder")).not.toContain("admins");
  expect(
    (await ceo.query(api.chat.conversations.list, {})).find(
      (row) => row.kind === "admins",
    ),
  ).toBeDefined();
});
