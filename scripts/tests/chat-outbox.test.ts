import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxEntry } from "../../src/lib/chat-outbox";

function entry(nonce: string, createdAt = 1): OutboxEntry {
  return {
    nonce,
    createdAt,
    body: "A saved message",
    attachmentIds: [],
    images: [],
    replyTo: null,
    mentions: [],
    everyone: false,
    status: "queued",
  };
}
let storage: Map<string, string>;
let browser: EventTarget & { localStorage: Storage };
beforeEach(() => {
  vi.resetModules();
  storage = new Map();
  browser = Object.assign(new EventTarget(), {
    localStorage: {
      get length() {
        return storage.size;
      },
      key: (index: number) => [...storage.keys()][index] ?? null,
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
    },
  });
  vi.stubGlobal("window", browser);
});
afterEach(() => vi.unstubAllGlobals());

function changed(key: string | null) {
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: key });
  browser.dispatchEvent(event);
}

describe("durable chat outbox", () => {
  it("migrates the live unversioned queue without changing a retry nonce", async () => {
    const outbox = await import("../../src/lib/chat-outbox");
    const oldKey = "50x:chat-outbox:alice:room";
    storage.set(
      oldKey,
      JSON.stringify([{ ...entry("earlier"), status: "sending" }]),
    );
    const key = outbox.outboxKey("alice", "room");
    expect(outbox.getOutbox(key)[0]).toMatchObject({
      nonce: "earlier",
      uncertain: true,
    });
    outbox.updateOutbox(key, (rows) =>
      rows.map((row) => ({ ...row, status: "queued" })),
    );
    expect(storage.has(oldKey)).toBe(false);
    expect(storage.has(key + ":entry:earlier")).toBe(true);
  });
  it("recovers the exact original nonce, reply, poll and attachments after an uncertain send", async () => {
    const outbox = await import("../../src/lib/chat-outbox");
    const key = outbox.outboxKey("alice", "room");
    const sent = {
      ...entry("original-nonce"),
      status: "sending",
      poll: { options: ["One", "Two"] },
      attachmentIds: ["attachment"],
      images: [
        {
          attachmentId: "attachment",
          url: "blob:preview",
          width: 1,
          height: 1,
        },
      ],
    } as OutboxEntry;
    outbox.updateOutbox(key, () => [sent]);
    expect(outbox.getOutbox(key)[0].images).toHaveLength(1);
    expect([...storage.values()].join()).not.toContain("blob:");
    vi.resetModules();
    const reloaded = await import("../../src/lib/chat-outbox");
    expect(reloaded.getOutbox(key)[0]).toMatchObject({
      nonce: "original-nonce",
      attachmentIds: ["attachment"],
      poll: { options: ["One", "Two"] },
      images: [],
      status: "failed",
      uncertain: true,
    });
    reloaded.updateOutbox(key, (rows) =>
      rows.map((row) => ({ ...row, status: "queued" })),
    );
    expect(reloaded.getOutbox(key)[0].nonce).toBe("original-nonce");
  });

  it("rejects malformed rows independently and sanitizes transient display metadata", async () => {
    const { restoreOutbox } = await import("../../src/lib/chat-outbox");
    const raw = JSON.stringify([
      { ...entry("bad-poll"), poll: null },
      { ...entry("bad-reply"), replyTo: { _id: 42 } },
      {
        ...entry("valid"),
        mentions: [null, { clerkId: "bob", handle: "bob" }],
        images: [{ url: "javascript:bad" }],
      },
      entry("valid"),
    ]);
    expect(restoreOutbox(raw)).toHaveLength(1);
    expect(restoreOutbox(raw)[0]).toMatchObject({
      nonce: "valid",
      mentions: [{ clerkId: "bob", handle: "bob" }],
      images: [],
    });
  });

  it("keeps other tabs' sibling messages and restores chronological queue order", async () => {
    const outbox = await import("../../src/lib/chat-outbox");
    const key = outbox.outboxKey("alice", "room");
    outbox.updateOutbox(key, () => [entry("first", 1)]);
    storage.set(key + ":entry:remote", JSON.stringify(entry("remote", 2)));
    outbox.updateOutbox(key, (rows) => [...rows, entry("last", 3)]);
    expect(outbox.getOutbox(key).map((row) => row.nonce)).toEqual([
      "first",
      "remote",
      "last",
    ]);
    outbox.updateOutbox(key, (rows) =>
      rows.filter((row) => row.nonce !== "first"),
    );
    expect([...storage.keys()]).toContain(key + ":entry:remote");
  });

  it("keeps in-flight ownership and local previews across storage notifications and remounts", async () => {
    const outbox = await import("../../src/lib/chat-outbox");
    const key = outbox.outboxKey("alice", "room");
    const local = { ...entry("mine"), status: "sending" } as OutboxEntry;
    outbox.updateOutbox(key, () => [local]);
    expect(outbox.claimOutboxSend(key, "mine")).toBe(true);
    const stop = outbox.subscribeOutbox(() => {});
    storage.set(key + ":entry:other", JSON.stringify(entry("other", 2)));
    changed(key + ":entry:other");
    expect(outbox.getOutbox(key)[0].status).toBe("sending");
    expect(outbox.claimOutboxSend(key, "mine")).toBe(false);
    stop();
    storage.delete(key + ":entry:other");
    const unmount = outbox.subscribeOutbox(() => {});
    expect(outbox.getOutbox(key).map((row) => row.nonce)).toEqual(["mine"]);
    unmount();
  });

  it("retains failed durable writes and failed removals without resurrecting stale disk data", async () => {
    const outbox = await import("../../src/lib/chat-outbox");
    const key = outbox.outboxKey("alice", "room");
    outbox.updateOutbox(key, () => [entry("mine")]);
    browser.localStorage.setItem = () => {
      throw new Error("full");
    };
    browser.localStorage.removeItem = () => {
      throw new Error("full");
    };
    expect(
      outbox.updateOutbox(key, (rows) =>
        rows.map((row) => ({ ...row, status: "failed" })),
      ),
    ).toBe(false);
    expect(outbox.isOutboxDurable(key)).toBe(false);
    expect(outbox.getOutbox(key)[0].status).toBe("failed");
    expect(outbox.updateOutbox(key, () => [])).toBe(false);
    const stop = outbox.subscribeOutbox(() => {});
    changed(key + ":entry:mine");
    expect(outbox.getOutbox(key)).toEqual([]);
    stop();
  });

  it("separates accounts, conversations and active nonce claims", async () => {
    const outbox = await import("../../src/lib/chat-outbox");
    const alice = outbox.outboxKey("a:b", "c");
    const bob = outbox.outboxKey("a", "b:c");
    expect(alice).not.toBe(bob);
    outbox.updateOutbox(alice, () => [entry("same-nonce")]);
    expect(outbox.getOutbox(bob)).toEqual([]);
    expect(outbox.getOutbox(null)).toEqual([]);
    expect(outbox.claimOutboxSend(alice, "same-nonce")).toBe(true);
    expect(outbox.claimOutboxSend(bob, "same-nonce")).toBe(true);
  });
});
