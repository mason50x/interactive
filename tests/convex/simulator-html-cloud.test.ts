import { expect, test } from "vitest";
import { api, internal } from "@convex/_generated/api";
import { actor, makeConvexTest, seedUsers } from "../helpers/convex";

test("HTML metadata is owner scoped, bounded and purged with accounts", async () => {
  const t = makeConvexTest({ rateLimited: true });
  await seedUsers(t, ["alice", "bob"]);
  const a = actor(t, "alice"),
    b = actor(t, "bob");
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
