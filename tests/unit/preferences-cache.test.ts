import { afterEach, describe, expect, test, vi } from "vitest";
import { defaultPreferences } from "@/lib/preferences";
import {
  cachePreferences,
  clearCachedPreferences,
  parseCachedPreferences,
  PREFERENCES_STORAGE_KEY,
  readCachedPreferences,
} from "@/lib/preferences-cache";

afterEach(() => vi.unstubAllGlobals());

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
  return store;
}

describe("parseCachedPreferences", () => {
  test.each([null, "", "not json", "{", "42", '"string"', "true", "null"])(
    "%j is nothing cached",
    (raw) => {
      expect(parseCachedPreferences(raw)).toBeNull();
    },
  );

  test("a JSON array is not a row and reads as nothing cached", () => {
    expect(parseCachedPreferences("[]")).toBeNull();
  });

  test("a valid row is resolved, with bad fields falling back", () => {
    expect(
      parseCachedPreferences(
        JSON.stringify({ accent: "rose", tabMask: "gmail", panicKey: 7 }),
      ),
    ).toEqual({ ...defaultPreferences, accent: "rose", tabMask: "gmail" });
    expect(parseCachedPreferences("{}")).toEqual(defaultPreferences);
  });
});

describe("the cache in localStorage", () => {
  test("the key is the one preferencesScript reads", () => {
    expect(PREFERENCES_STORAGE_KEY).toBe("il-preferences");
  });

  test("a cached row round-trips and is cleared on sign-out", () => {
    const store = stubStorage();
    expect(readCachedPreferences()).toBeNull();

    const preferences = { ...defaultPreferences, accent: "cyan" as const };
    cachePreferences(preferences);
    expect(store.get(PREFERENCES_STORAGE_KEY)).toBe(
      JSON.stringify(preferences),
    );
    expect(parseCachedPreferences(readCachedPreferences())).toEqual(
      preferences,
    );

    clearCachedPreferences();
    expect(readCachedPreferences()).toBeNull();
    expect(store.size).toBe(0);
  });

  test("a browser without storage reads nothing and writes without throwing", () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked");
      },
    });
    expect(readCachedPreferences()).toBeNull();
    expect(() => cachePreferences(defaultPreferences)).not.toThrow();
    expect(() => clearCachedPreferences()).not.toThrow();
  });
});
