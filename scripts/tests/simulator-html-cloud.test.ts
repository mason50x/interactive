/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
const modules = import.meta.glob("../../convex/**/*.ts");
test("HTML metadata is owner scoped, bounded and purged with accounts", async () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("users", { clerkId: "alice" });
    await ctx.db.insert("users", { clerkId: "bob" });
  });
  const a = t.withIdentity({ subject: "alice" }),
    b = t.withIdentity({ subject: "bob" });
  const contentHash = "a".repeat(64);
  await a.mutation(api.simulator.html.register, {
    contentHash,
    label: "My lesson",
  });
  expect(await b.query(api.simulator.html.list, {})).toEqual([]);
  await b.mutation(api.simulator.html.remove, { contentHash });
  await b.mutation(api.simulator.html.rename, {
    contentHash,
    label: "Other name",
  });
  const entry = (await a.query(api.simulator.html.list, {}))[0];
  expect(entry.label).toBe("My lesson");
  expect(Object.keys(entry).sort()).toEqual(
    [
      "_creationTime",
      "_id",
      "contentHash",
      "createdAt",
      "label",
      "lastOpenedAt",
      "ownerClerkId",
    ].sort(),
  );
  await expect(t.query(api.simulator.html.list, {})).rejects.toThrow();
  await expect(
    a.mutation(
      api.simulator.html.register,
      Object.assign(
        { contentHash, label: "No source" },
        { html: "<p>must not upload</p>" },
      ),
    ),
  ).rejects.toThrow();
  await t.run(async (ctx) => {
    for (let i = 0; i < 19; i++)
      await ctx.db.insert("htmlSimulatorEntries", {
        ownerClerkId: "alice",
        contentHash: i.toString(16).padStart(64, "0"),
        label: "Entry",
        createdAt: 0,
        lastOpenedAt: 0,
      });
  });
  await expect(
    a.mutation(api.simulator.html.register, {
      contentHash: "b".repeat(64),
      label: "Over capacity",
    }),
  ).rejects.toThrow("full");
  await t.mutation(internal.simulator.cleanup.purgeOwner, { clerkId: "alice" });
  expect(await a.query(api.simulator.html.list, {})).toEqual([]);
});
