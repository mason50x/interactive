import { beforeEach, afterEach, expect, test, vi } from "vitest";
import "fake-indexeddb/auto";
import { ProgressSync } from "../../src/lib/simulator/sync";
import { makeProgress } from "../../src/lib/simulator/progress";
import { clearLocal, readLocal } from "../../src/lib/simulator/local-store";
import { getFunctionName } from "convex/server";
import type { ConvexReactClient } from "convex/react";
import type { Entry } from "../../src/lib/simulator/types";
const hash = "b".repeat(64),
  owner = "sync-test";
function capture() {
  const checkpoint = new ArrayBuffer(199608);
  new DataView(checkpoint).setUint32(0, 1800906722, true);
  return makeProgress(hash, "mono", { checkpoint });
}
function fakeClient() {
  let revision = 0;
  let deleted = false;
  const writes: string[] = [];
  const e = {
    _id: "entry1",
    contentHash: hash,
    mode: "mono",
    label: "Example",
    revision: 0,
  } as Entry;
  const client = {
    query: vi.fn(
      async (fn: Parameters<typeof getFunctionName>[0]): Promise<unknown> =>
        getFunctionName(fn).endsWith("library:get")
          ? deleted
            ? null
            : { ...e, revision }
          : [],
    ),
    mutation: vi.fn(
      async (
        fn: Parameters<typeof getFunctionName>[0],
        args: Record<string, unknown>,
      ) => {
        if (getFunctionName(fn).endsWith("library:register"))
          return { ...e, revision };
        if (deleted) return { ok: false, reason: "deleted", revision: 0 };
        if (args.expectedRevision !== revision)
          return { ok: false, reason: "conflict", revision };
        writes.push(args.captureId as string);
        return { ok: true, revision: ++revision, captureId: args.captureId };
      },
    ),
  };
  return {
    client: client as unknown as ConvexReactClient,
    writes,
    bump: () => revision++,
    remove: () => {
      deleted = true;
    },
    mock: client,
  };
}
let managers: ProgressSync[] = [];
beforeEach(async () => {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("navigator", { onLine: true });
  await clearLocal(owner);
});
afterEach(() => {
  for (const m of managers) m.stop();
  managers = [];
  vi.unstubAllGlobals();
});
function manager(client: ConvexReactClient) {
  const m = new ProgressSync(owner, hash, "mono", client, () => {});
  managers.push(m);
  return m;
}
test("local-first outbox survives reload and uploads only progress", async () => {
  const f = fakeClient(),
    m = manager(f.client);
  await m.init();
  const p = capture();
  await m.capture(p);
  expect((await readLocal(owner, hash))?.pending.auto?.captureId).toBe(
    p.captureId,
  );
  const next = manager(f.client);
  await next.init();
  await next.flush(true);
  expect(f.writes).toEqual([p.captureId]);
  expect((await readLocal(owner, hash))?.pending).toEqual({});
  const args = f.mock.mutation.mock.calls[0][1];
  expect(args).not.toHaveProperty("bytes");
  expect(args).not.toHaveProperty("program");
});
test("a capture made during an in-flight write survives its acknowledgement", async () => {
  const f = fakeClient(),
    m = manager(f.client);
  await m.init();
  await m.capture(capture());
  let release!: () => void;
  const original = f.mock.mutation.getMockImplementation()!;
  f.mock.mutation.mockImplementationOnce(async (fn, args) => {
    await new Promise<void>((resolve) => (release = resolve));
    return original(fn, args);
  });
  const flight = m.flush(true);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const newer = capture();
  await m.capture(newer);
  release();
  await flight;
  expect(m.record.pending.auto?.captureId).toBe(newer.captureId);
  expect(m.record.revision).toBe(1);
  await m.flush(true);
  expect(m.record.pending).toEqual({});
});
test("offline divergence does not overwrite cloud and survives conflict choice", async () => {
  const f = fakeClient(),
    m = manager(f.client);
  await m.init();
  await m.capture(capture());
  f.bump();
  await m.flush(true);
  expect(m.status.cloud).toBe("conflict");
  expect(f.writes).toHaveLength(0);
  await m.chooseLocal();
  expect(m.status.cloud).toBe("synced");
  expect(f.writes).toHaveLength(1);
});
test("cloud deletion is never recreated by pending local progress", async () => {
  const f = fakeClient(),
    m = manager(f.client);
  await m.init();
  await m.capture(capture());
  f.remove();
  await m.flush(true);
  expect(m.status.cloud).toBe("deleted");
  expect(f.writes).toHaveLength(0);
});
test("offline save remains locally usable with no network call", async () => {
  const f = fakeClient(),
    m = manager(f.client);
  await m.init();
  f.mock.mutation.mockClear();
  vi.stubGlobal("navigator", { onLine: false });
  await m.capture(capture());
  await m.flush(true);
  expect(m.status.cloud).toBe("offline");
  expect(m.record.saves.auto).toBeDefined();
  expect(f.mock.mutation).not.toHaveBeenCalled();
});
test("manual slots survive autosaves and previous rotation", async () => {
  const f = fakeClient(),
    m = manager(f.client);
  await m.init();
  const manual = capture(),
    first = capture();
  await m.capture(manual, "manual1");
  await m.capture(first);
  await m.capture(capture());
  expect(m.record.saves.manual1?.captureId).toBe(manual.captureId);
  expect(m.record.saves.previous?.captureId).toBe(first.captureId);
});

test("reconnect recognizes a committed capture with a lost acknowledgement", async () => {
  const f = fakeClient(),
    m = manager(f.client);
  await m.init();
  const p = capture();
  await m.capture(p);
  f.bump();
  const original = f.mock.query.getMockImplementation()!;
  f.mock.query.mockImplementation(async (fn) =>
    getFunctionName(fn).endsWith("saves:list")
      ? [{ slot: "auto", revision: 1, captureId: p.captureId }]
      : original(fn),
  );
  const next = manager(f.client);
  await next.init();
  expect(next.status.cloud).not.toBe("conflict");
  expect(next.record.revision).toBe(1);
  expect(next.record.pending).toEqual({});
});
test("retry backoff is respected by the periodic flush", async () => {
  const f = fakeClient(),
    m = manager(f.client);
  await m.init();
  await m.capture(capture());
  f.mock.mutation.mockRejectedValue(new Error("Network unavailable"));
  await m.flush(true);
  expect(f.mock.mutation).toHaveBeenCalledTimes(1);
  await m.flush();
  expect(f.mock.mutation).toHaveBeenCalledTimes(1);
});
