import { afterEach, describe, expect, test, vi } from "vitest";
import {
  readStorage,
  readStoredJson,
  removeStorage,
  storageAvailable,
  storageKeys,
  writeStorage,
  writeStoredJson,
} from "@/lib/storage";

afterEach(() => vi.unstubAllGlobals());

function stubThrowingStorage() {
  vi.stubGlobal("window", {
    get localStorage(): Storage {
      throw new Error("Access is denied for this document");
    },
  });
}

function stubWorkingStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
  return store;
}

describe("when storage access throws", () => {
  test("reads fall back to null and nothing", () => {
    stubThrowingStorage();
    expect(storageAvailable()).toBe(false);
    expect(readStorage("il-theme")).toBeNull();
    expect(readStoredJson("il-preferences")).toBeNull();
    expect(storageKeys()).toEqual([]);
  });

  test("writes and removals are swallowed", () => {
    stubThrowingStorage();
    expect(() => writeStorage("k", "v")).not.toThrow();
    expect(() => writeStoredJson("k", { a: 1 })).not.toThrow();
    expect(() => removeStorage("k")).not.toThrow();
  });

  test("a missing window entirely is also unavailable", () => {
    vi.stubGlobal("window", undefined);
    expect(storageAvailable()).toBe(false);
    expect(readStorage("k")).toBeNull();
    expect(storageKeys()).toEqual([]);
  });
});

describe("when storage works", () => {
  test("strings round-trip and removal clears them", () => {
    const store = stubWorkingStorage();
    expect(storageAvailable()).toBe(true);
    expect(readStorage("k")).toBeNull();
    writeStorage("k", "v");
    expect(readStorage("k")).toBe("v");
    expect(store.get("k")).toBe("v");
    removeStorage("k");
    expect(readStorage("k")).toBeNull();
  });

  test("JSON round-trips through the typed helpers", () => {
    stubWorkingStorage();
    writeStoredJson("row", { accent: "rose", n: [1, 2] });
    expect(readStoredJson<{ accent: string; n: number[] }>("row")).toEqual({
      accent: "rose",
      n: [1, 2],
    });
    expect(readStorage("row")).toBe('{"accent":"rose","n":[1,2]}');
  });

  test("a value that is not JSON reads as null, and a missing key too", () => {
    stubWorkingStorage();
    writeStorage("raw", "not json {");
    expect(readStoredJson("raw")).toBeNull();
    expect(readStorage("raw")).toBe("not json {");
    expect(readStoredJson("absent")).toBeNull();
  });

  test("storageKeys lists every stored key", () => {
    stubWorkingStorage();
    expect(storageKeys()).toEqual([]);
    writeStorage("a", "1");
    writeStorage("b", "2");
    writeStoredJson("c", 3);
    expect(storageKeys().sort()).toEqual(["a", "b", "c"]);
    removeStorage("b");
    expect(storageKeys().sort()).toEqual(["a", "c"]);
  });
});
