/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import {
  MAX_PUBLISHED_HTML_BYTES,
  MAX_PUBLISHED_HTML_ENTRIES,
} from "../../config/published-html";
const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify({
      ceo: "ceo",
      builder: "builder",
      second: "builder",
      head: "head_moderator",
      mod: "moderator",
    }),
  );
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  await t.run(async (ctx) => {
    for (const clerkId of ["ceo", "builder", "second", "head", "mod", "member"])
      await ctx.db.insert("users", { clerkId });
  });
  return t;
}
const draft = (operationId = "first") => ({
  operationId,
  label: "Gravity",
  description: "Explore gravity",
  source: "<!doctype html><h1>Gravity</h1><script>window.answer = 42</script>",
});

test("only Builder and CEO may publish; all signed-in members can load the template", async () => {
  const t = await setup();
  for (const subject of ["member", "mod", "head"]) {
    const user = t.withIdentity({ subject });
    expect(await user.query(api.simulator.published.access, {})).toBe(false);
    await expect(
      user.action(api.simulator.published.save, draft()),
    ).rejects.toThrow("Only Builders and CEOs");
  }
  await expect(t.action(api.simulator.published.save, draft())).rejects.toThrow(
    "Sign in",
  );
  await expect(t.query(api.simulator.published.list, {})).rejects.toThrow(
    "Sign in",
  );
  for (const subject of ["builder", "ceo"]) {
    const user = t.withIdentity({ subject });
    expect(await user.query(api.simulator.published.access, {})).toBe(true);
    const id = await user.action(api.simulator.published.save, draft(subject));
    const entry = await t
      .withIdentity({ subject: "member" })
      .query(api.simulator.published.get, { id });
    expect(entry).toMatchObject({
      label: "Gravity",
      revision: 1,
      byteLength: new TextEncoder().encode(draft().source).byteLength,
    });
    expect(entry?.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(entry?.url).toBeTruthy();
    const row = await t.run((ctx) => ctx.db.get(id));
    const file = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(row!.storageId);
      return { text: await blob?.text(), type: blob?.type };
    });
    expect(file.text).toBe(draft().source);
    expect(file.type).toBe("application/octet-stream");
  }
  const list = await t
    .withIdentity({ subject: "member" })
    .query(api.simulator.published.list, {});
  expect(list).toHaveLength(2);
  expect(list[0]).not.toHaveProperty("url");
  expect(list[0]).not.toHaveProperty("storageId");
  expect(list[0]).not.toHaveProperty("source");
  expect(
    await t
      .withIdentity({ subject: "member" })
      .query(api.simulator.html.list, {}),
  ).toEqual([]);
});

test("shared editing replaces stored code, rejects stale editors/deletes, and removes files", async () => {
  const t = await setup();
  const builder = t.withIdentity({ subject: "builder" }),
    second = t.withIdentity({ subject: "second" });
  const id = await builder.action(api.simulator.published.save, draft());
  const original = (await t.run((ctx) => ctx.db.get(id)))!;
  await second.action(api.simulator.published.save, {
    ...draft("edit"),
    id,
    expectedRevision: 1,
    source: "<p>New version</p>",
  });
  const updated = (await t.run((ctx) => ctx.db.get(id)))!;
  expect(updated.revision).toBe(2);
  expect(updated.createdBy).toBe("builder");
  expect(updated.updatedBy).toBe("second");
  expect(await t.run((ctx) => ctx.storage.get(original.storageId))).toBeNull();
  await expect(
    builder.action(api.simulator.published.save, {
      ...draft("stale"),
      id,
      expectedRevision: 1,
    }),
  ).rejects.toThrow("changed");
  await expect(
    builder.mutation(api.simulator.published.remove, {
      id,
      expectedRevision: 1,
    }),
  ).rejects.toThrow("changed");
  for (const subject of ["member", "mod", "head"]) {
    const user = t.withIdentity({ subject });
    await expect(
      user.mutation(api.simulator.published.remove, {
        id,
        expectedRevision: 2,
      }),
    ).rejects.toThrow("Only Builders and CEOs");
    await expect(
      user.action(api.simulator.published.save, {
        ...draft("denied"),
        id,
        expectedRevision: 2,
      }),
    ).rejects.toThrow("Only Builders and CEOs");
  }
  await t
    .withIdentity({ subject: "ceo" })
    .mutation(api.simulator.published.remove, { id, expectedRevision: 2 });
  expect(await t.run((ctx) => ctx.storage.get(updated.storageId))).toBeNull();
  expect(await builder.query(api.simulator.published.get, { id })).toBeNull();
  expect(
    await builder.query(api.simulator.published.get, { id: "invalid" }),
  ).toBeNull();
  await expect(
    builder.action(api.simulator.published.save, {
      ...draft("missing"),
      id,
      expectedRevision: 2,
    }),
  ).rejects.toThrow("removed");
});

test("retrying the same publish/update is idempotent and metadata edits preserve the source hash", async () => {
  const t = await setup();
  const user = t.withIdentity({ subject: "builder" });
  const id = await user.action(api.simulator.published.save, draft());
  expect(await user.action(api.simulator.published.save, draft())).toBe(id);
  const original = (await t.run((ctx) => ctx.db.get(id)))!;
  const update = {
    ...draft("rename"),
    id,
    expectedRevision: 1,
    label: "Renamed",
  };
  await user.action(api.simulator.published.save, update);
  await user.action(api.simulator.published.save, update);
  const renamed = (await t.run((ctx) => ctx.db.get(id)))!;
  expect(renamed.revision).toBe(2);
  expect(renamed.contentHash).toBe(original.contentHash);
  expect(renamed.storageId).toBe(original.storageId);
  expect(await user.action(api.simulator.published.save, draft())).toBe(id);
  expect((await t.run((ctx) => ctx.db.get(id)))?.label).toBe("Renamed");
  expect(
    await t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(1);
  await expect(
    user.action(api.simulator.published.save, {
      ...update,
      source: "<p>Other</p>",
    }),
  ).rejects.toThrow("different content");
  expect(
    await t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(1);
});

test("server enforces byte limits, names, descriptions and rate limits before retaining files", async () => {
  const t = await setup();
  const user = t.withIdentity({ subject: "builder" });
  for (const changes of [
    { source: " " },
    { source: "<p>\0</p>" },
    { source: "é".repeat(MAX_PUBLISHED_HTML_BYTES / 2 + 1) },
    { label: "x".repeat(61) },
    { description: "x".repeat(281) },
  ]) {
    await expect(
      user.action(api.simulator.published.save, { ...draft(), ...changes }),
    ).rejects.toThrow();
  }
  expect(
    await t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(0);
  await user.action(api.simulator.published.save, draft("last"));
  await expect(
    user.action(api.simulator.published.save, draft("limited")),
  ).rejects.toThrow("wait");
});

test("the global catalogue cap is enforced and failed uploads are cleaned up", async () => {
  const t = await setup();
  const user = t.withIdentity({ subject: "builder" });
  const id = await user.action(api.simulator.published.save, draft());
  await t.run(async (ctx) => {
    const row = (await ctx.db.get(id))!;
    const { _id, _creationTime, ...data } = row;
    void _id;
    void _creationTime;
    for (let i = 1; i < MAX_PUBLISHED_HTML_ENTRIES; i++)
      await ctx.db.insert("publishedHtmlSimulators", {
        ...data,
        publishKey: `fixture-${i}`,
      });
  });
  await expect(
    user.action(api.simulator.published.save, draft("overflow")),
  ).rejects.toThrow("full");
  expect(await user.query(api.simulator.published.list, {})).toHaveLength(
    MAX_PUBLISHED_HTML_ENTRIES,
  );
  expect(
    await t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(1);
});

test("live role revocation is rechecked between upload and commit", async () => {
  const t = await setup();
  const user = t.withIdentity({ subject: "builder" });
  await user.mutation(internal.simulator.published.begin, {
    operationId: "in-flight",
  });
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["<p>Hello</p>"])),
  );
  await t
    .withIdentity({ subject: "ceo" })
    .mutation(api.adminQuotas.setRole, {
      clerkId: "builder",
      role: "moderator",
    });
  await expect(
    user.mutation(internal.simulator.published.commit, {
      operationId: "in-flight",
      label: "Hello",
      description: "",
      storageId,
      contentHash: "a".repeat(64),
      byteLength: 12,
    }),
  ).rejects.toThrow("Only Builders and CEOs");
  await t.mutation(internal.simulator.published.discard, { storageId });
  expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  expect(await user.query(api.simulator.published.list, {})).toEqual([]);
});

test("timeouts deny publishing and cleanup never deletes a referenced file", async () => {
  const t = await setup();
  const user = t.withIdentity({ subject: "builder" });
  const id = await user.action(api.simulator.published.save, draft());
  const row = (await t.run((ctx) => ctx.db.get(id)))!;
  await t.mutation(internal.simulator.published.discard, {
    storageId: row.storageId,
  });
  expect(
    await t.run(async (ctx) => !!(await ctx.storage.get(row.storageId))),
  ).toBe(true);
  await t
    .withIdentity({ subject: "ceo" })
    .mutation(api.timeouts.set, {
      clerkId: "builder",
      enabled: true,
      reason: "Test",
      durationMinutes: 5,
    });
  await expect(
    user.action(api.simulator.published.save, draft("timeout")),
  ).rejects.toThrow();
  await expect(
    user.mutation(api.simulator.published.remove, { id, expectedRevision: 1 }),
  ).rejects.toThrow();
});
