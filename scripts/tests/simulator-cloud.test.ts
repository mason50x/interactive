/// <reference types="vite/client" />
import { beforeEach, expect, test } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import {
  ENGINE_BUILD,
  STATE_BYTES,
  STATE_HEADER,
} from "../../convex/simulator/model";
const modules = import.meta.glob("../../convex/**/*.ts");
const makeTest = () => convexTest(schema, modules);
let t: ReturnType<typeof makeTest>;
const hash = "a".repeat(64);
function progress(id = crypto.randomUUID()) {
  const checkpoint = new ArrayBuffer(STATE_BYTES);
  new DataView(checkpoint).setUint32(0, STATE_HEADER, true);
  return {
    captureId: id,
    engineBuild: ENGINE_BUILD,
    formatVersion: 1,
    capturedAt: Date.now(),
    checkpoint,
  };
}
beforeEach(async () => {
  t = makeTest();
  rateLimiter.register(t);
  await t.run(async (ctx) => {
    for (const clerkId of ["alice", "bob"]) {
      await ctx.db.insert("users", { clerkId });
      await ctx.db.insert("agreements", {
        clerkId,
        version: 1,
        agreedAt: Date.now(),
      });
    }
  });
});
const alice = () => t.withIdentity({ subject: "alice" }),
  bob = () => t.withIdentity({ subject: "bob" });
test("owner isolation for list, read, write, rename, restore and delete", async () => {
  const a = alice(),
    b = bob();
  const e = await a.mutation(api.simulator.library.register, {
    contentHash: hash,
    mode: "mono",
  });
  await a.mutation(api.simulator.saves.commit, {
    entryId: e._id,
    expectedRevision: 0,
    slot: "auto",
    ...progress(),
  });
  expect(await b.query(api.simulator.library.list, {})).toEqual([]);
  expect(
    await b.query(api.simulator.library.get, { contentHash: hash }),
  ).toBeNull();
  await expect(
    b.query(api.simulator.saves.read, { entryId: e._id, slot: "auto" }),
  ).rejects.toThrow();
  await expect(
    b.mutation(api.simulator.saves.commit, {
      entryId: e._id,
      expectedRevision: 1,
      slot: "auto",
      ...progress(),
    }),
  ).rejects.toThrow();
  await expect(
    b.mutation(api.simulator.library.rename, {
      entryId: e._id,
      label: "Stolen",
    }),
  ).rejects.toThrow();
  await expect(
    b.mutation(api.simulator.library.remove, { entryId: e._id }),
  ).rejects.toThrow();
  await expect(
    b.mutation(api.simulator.saves.restore, {
      entryId: e._id,
      expectedRevision: 1,
      slot: "auto",
      captureId: crypto.randomUUID(),
    }),
  ).rejects.toThrow();
  await expect(t.query(api.simulator.library.list, {})).rejects.toThrow();
});
test("atomic revisions, retry idempotence and bounded autosave rotation", async () => {
  const a = alice(),
    e = await a.mutation(api.simulator.library.register, {
      contentHash: hash,
      mode: "mono",
    }),
    p = progress();
  const input = {
    entryId: e._id,
    expectedRevision: 0,
    slot: "auto" as const,
    ...p,
  };
  expect((await a.mutation(api.simulator.saves.commit, input)).ok).toBe(true);
  expect(await a.mutation(api.simulator.saves.commit, input)).toEqual({
    ok: true,
    revision: 1,
    captureId: p.captureId,
  });
  const conflict = await a.mutation(api.simulator.saves.commit, {
    ...input,
    ...progress(),
  });
  expect(conflict).toMatchObject({ ok: false, reason: "conflict" });
  await a.mutation(api.simulator.saves.commit, {
    ...input,
    ...progress(),
    expectedRevision: 1,
  });
  expect(
    (
      await a.query(api.simulator.saves.read, {
        entryId: e._id,
        slot: "previous",
      })
    )?.captureId,
  ).toBe(p.captureId);
  const rows = await a.query(api.simulator.saves.list, { entryId: e._id });
  expect(rows).toHaveLength(2);
  expect(rows[0]).not.toHaveProperty("checkpoint");
});
test("deletion generation cannot be resurrected by a stale writer", async () => {
  const a = alice(),
    e = await a.mutation(api.simulator.library.register, {
      contentHash: hash,
      mode: "mono",
    });
  await a.mutation(api.simulator.library.remove, { entryId: e._id });
  const recreated = await a.mutation(api.simulator.library.register, {
    contentHash: hash,
    mode: "mono",
  });
  expect(recreated._id).not.toBe(e._id);
  expect(
    await a.mutation(api.simulator.saves.commit, {
      entryId: e._id,
      expectedRevision: 0,
      slot: "auto",
      ...progress(),
    }),
  ).toMatchObject({ ok: false, reason: "deleted" });
});
test("rejects malformed/oversized payloads and unknown build", async () => {
  const a = alice(),
    e = await a.mutation(api.simulator.library.register, {
      contentHash: hash,
      mode: "mono",
    });
  for (const patch of [
    { checkpoint: new ArrayBuffer(800000) },
    { engineBuild: "unknown" },
    { checkpoint: new ArrayBuffer(STATE_BYTES) },
    { battery: new ArrayBuffer(123) },
  ])
    await expect(
      a.mutation(api.simulator.saves.commit, {
        entryId: e._id,
        expectedRevision: 0,
        slot: "auto",
        ...progress(),
        ...patch,
      }),
    ).rejects.toThrow();
});
test("cloud writes require agreement but export and deletion remain available", async () => {
  const a = alice(),
    e = await a.mutation(api.simulator.library.register, {
      contentHash: hash,
      mode: "mono",
    });
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("agreements")
      .withIndex("byClerkId", (q) => q.eq("clerkId", "alice"))
      .unique();
    await ctx.db.delete(row!._id);
  });
  await expect(
    a.mutation(api.simulator.saves.commit, {
      entryId: e._id,
      expectedRevision: 0,
      slot: "auto",
      ...progress(),
    }),
  ).rejects.toThrow();
  expect(
    await a.query(api.simulator.saves.read, { entryId: e._id, slot: "auto" }),
  ).toBeNull();
  await a.mutation(api.simulator.library.remove, { entryId: e._id });
});
test("cleanup erases only the deleted owner and cannot delete chat storage", async () => {
  const a = alice(),
    b = bob();
  for (const c of [a, b]) {
    const e = await c.mutation(api.simulator.library.register, {
      contentHash: hash,
      mode: "mono",
    });
    await c.mutation(api.simulator.saves.commit, {
      entryId: e._id,
      expectedRevision: 0,
      slot: "auto",
      ...progress(),
    });
  }
  await t.mutation(internal.simulator.cleanup.purgeOwner, { clerkId: "alice" });
  expect(await a.query(api.simulator.library.list, {})).toHaveLength(0);
  expect(await b.query(api.simulator.library.list, {})).toHaveLength(1);
});
test("parallel sessions with the same base accept only one write", async () => {
  const a = alice(),
    e = await a.mutation(api.simulator.library.register, {
      contentHash: hash,
      mode: "mono",
    });
  const results = await Promise.all(
    [1, 2].map(() =>
      a.mutation(api.simulator.saves.commit, {
        entryId: e._id,
        expectedRevision: 0,
        slot: "auto",
        ...progress(),
      }),
    ),
  );
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok)).toHaveLength(1);
});

test("entry limit remains enforced independently of rate limits", async () => {
  await t.run(async (ctx) => {
    for (let i = 0; i < 20; i++)
      await ctx.db.insert("simulatorEntries", {
        ownerClerkId: "alice",
        contentHash: i.toString(16).padStart(64, "0"),
        label: "Test",
        source: "imported",
        mode: "mono",
        createdAt: 1,
        lastOpenedAt: 1,
        updatedAt: 1,
        revision: 0,
      });
  });
  await expect(
    alice().mutation(api.simulator.library.register, {
      contentHash: hash,
      mode: "mono",
    }),
  ).rejects.toThrow("full");
});
test("save rate limit returns a retry delay without advancing the revision", async () => {
  const a = alice(),
    e = await a.mutation(api.simulator.library.register, {
      contentHash: hash,
      mode: "mono",
    });
  for (let revision = 0; revision < 10; revision++)
    expect(
      (
        await a.mutation(api.simulator.saves.commit, {
          entryId: e._id,
          expectedRevision: revision,
          slot: "auto",
          ...progress(),
        })
      ).ok,
    ).toBe(true);
  expect(
    await a.mutation(api.simulator.saves.commit, {
      entryId: e._id,
      expectedRevision: 10,
      slot: "auto",
      ...progress(),
    }),
  ).toMatchObject({ ok: false, reason: "rate-limit", revision: 10 });
  expect(
    (await a.query(api.simulator.library.get, { contentHash: hash }))?.revision,
  ).toBe(10);
});
test("manual slots persist while restore rotates autosave and keeps five rows", async () => {
  const a = alice(),
    e = await a.mutation(api.simulator.library.register, {
      contentHash: hash,
      mode: "mono",
    });
  let revision = 0;
  for (const slot of ["manual1", "manual2", "manual3", "auto", "auto"] as const)
    await a.mutation(api.simulator.saves.commit, {
      entryId: e._id,
      expectedRevision: revision++,
      slot,
      ...progress(),
    });
  const manual = await a.query(api.simulator.saves.read, {
    entryId: e._id,
    slot: "manual1",
  });
  await a.mutation(api.simulator.saves.restore, {
    entryId: e._id,
    expectedRevision: revision,
    slot: "manual1",
    captureId: crypto.randomUUID(),
  });
  expect(
    (
      await a.query(api.simulator.saves.read, {
        entryId: e._id,
        slot: "manual1",
      })
    )?.captureId,
  ).toBe(manual?.captureId);
  expect(
    await a.query(api.simulator.saves.list, { entryId: e._id }),
  ).toHaveLength(5);
});

test("upload titles fill generic entries and preserve custom names", async () => {
  const a = alice();
  const entry = await a.mutation(api.simulator.library.register, { contentHash: hash, mode: "mono" });
  const named = await a.mutation(api.simulator.library.register, { contentHash: hash, mode: "mono", label: "Pokemon — Red Version" });
  expect(named.label).toBe("Pokemon — Red Version");
  await a.mutation(api.simulator.library.rename, { entryId: entry._id, label: "My adventure" });
  const again = await a.mutation(api.simulator.library.register, { contentHash: hash, mode: "mono", label: "Another filename" });
  expect(again.label).toBe("My adventure");
});
