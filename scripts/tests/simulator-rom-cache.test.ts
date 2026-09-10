import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createTestProgram } from "./simulator-fixture.mjs";
import { identify } from "../../src/lib/simulator/files";
import {
  accountKey,
  clearLocal,
  readLocal,
  readProgram,
  removeLocal,
  writeLocal,
  writeProgram,
} from "../../src/lib/simulator/local-store";

describe("local ROM cache", () => {
  it("upgrades existing save storage without losing progress", async () => {
    const legacy = { contentHash: "legacy", label: "Existing game", saves: {} };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("50x-learning-simulator-v1", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("progress");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("progress", "readwrite");
        tx.objectStore("progress").put(
          legacy,
          accountKey("legacy-owner") + "legacy",
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
    expect(await readLocal("legacy-owner", "legacy")).toEqual(legacy);
    expect(await readProgram("legacy-owner", "legacy")).toBeNull();
    await clearLocal("legacy-owner");
  });
  it("survives a new database connection and isolates accounts", async () => {
    const program = await identify(new Uint8Array(createTestProgram()).buffer);
    await writeProgram("cache-owner", program);
    const restored = await readProgram("cache-owner", program.contentHash);
    expect(restored).toEqual(program);
    expect(await readProgram("another-owner", program.contentHash)).toBeNull();
    await clearLocal("cache-owner");
  });
  it("removes the ROM with its entry without affecting another account", async () => {
    const program = await identify(new Uint8Array(createTestProgram()).buffer);
    await writeProgram("delete-owner", program);
    await writeProgram("keep-owner", program);
    await writeLocal("delete-owner", {
      contentHash: program.contentHash,
      mode: program.mode,
      label: "Test",
      revision: 0,
      updatedAt: 0,
      saves: {},
      pending: {},
    });
    await removeLocal("delete-owner", program.contentHash);
    expect(await readProgram("delete-owner", program.contentHash)).toBeNull();
    expect(
      await readLocal("delete-owner", program.contentHash),
    ).toBeUndefined();
    expect(await readProgram("keep-owner", program.contentHash)).toEqual(
      program,
    );
    await clearLocal("keep-owner");
    expect(await readProgram("keep-owner", program.contentHash)).toBeNull();
  });
  it("rejects bytes stored under the wrong content hash", async () => {
    const program = await identify(new Uint8Array(createTestProgram()).buffer);
    await writeProgram("corrupt-owner", {
      ...program,
      contentHash: "0".repeat(64),
    });
    await expect(readProgram("corrupt-owner", "0".repeat(64))).rejects.toThrow(
      "damaged",
    );
    await clearLocal("corrupt-owner");
  });
});
