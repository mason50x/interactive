import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getThemeSnapshot,
  parseThemeSnapshot,
  readStoredPreference,
  resolveTheme,
  SERVER_THEME_SNAPSHOT,
  setThemePreference,
  themeScript,
  usesAppTheme,
} from "@/lib/theme";

afterEach(() => vi.unstubAllGlobals());

function stubBrowser({ dark, stored }: { dark: boolean; stored?: string }) {
  const store = new Map<string, string>();
  if (stored !== undefined) store.set("il-theme", stored);
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && dark,
    }),
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
  return store;
}

describe("usesAppTheme", () => {
  test.each([
    ["/dashboard", true],
    ["/dashboard/activities", true],
    ["/dashboard/", true],
    ["/learn", true],
    ["/learn/some-slug", true],
    ["/dashboards", false],
    ["/learning", false],
    ["/", false],
    ["/about", false],
    ["", false],
    ["dashboard", false],
    ["/x/dashboard", false],
  ])("%j uses the saved appearance: %s", (pathname, expected) => {
    expect(usesAppTheme(pathname)).toBe(expected);
  });
});

describe("the stored preference", () => {
  test.each(["purple", "", "DARK", "{}", "null"])(
    "a malformed stored value %j reads as system",
    (stored) => {
      stubBrowser({ dark: false, stored });
      expect(readStoredPreference()).toBe("system");
    },
  );

  test("nothing stored, or storage that throws, is system", () => {
    stubBrowser({ dark: true });
    expect(readStoredPreference()).toBe("system");
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("blocked");
      },
    });
    expect(readStoredPreference()).toBe("system");
  });

  test("system is stored as the absence of a key, a choice as itself", () => {
    const store = stubBrowser({ dark: false, stored: "light" });
    setThemePreference("dark");
    expect(store.get("il-theme")).toBe("dark");
    expect(readStoredPreference()).toBe("dark");
    setThemePreference("system");
    expect(store.has("il-theme")).toBe(false);
    expect(readStoredPreference()).toBe("system");
  });
});

describe("snapshots", () => {
  test("the server snapshot is system resolved to light", () => {
    expect(SERVER_THEME_SNAPSHOT).toBe("system:light");
    expect(parseThemeSnapshot(SERVER_THEME_SNAPSHOT)).toEqual({
      preference: "system",
      resolved: "light",
    });
  });

  test.each([
    [{ dark: true }, "system:dark"],
    [{ dark: false }, "system:light"],
    [{ dark: true, stored: "light" }, "light:light"],
    [{ dark: false, stored: "dark" }, "dark:dark"],
    [{ dark: true, stored: "garbage" }, "system:dark"],
  ])("%o snapshots as %s and parses back", (browser, snapshot) => {
    stubBrowser(browser);
    expect(getThemeSnapshot()).toBe(snapshot);
    const [preference, resolved] = snapshot.split(":");
    expect(parseThemeSnapshot(getThemeSnapshot())).toEqual({
      preference,
      resolved,
    });
  });

  test("resolveTheme follows the OS only for system", () => {
    stubBrowser({ dark: true });
    expect(resolveTheme("system")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    stubBrowser({ dark: false });
    expect(resolveTheme("system")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});

describe("themeScript", () => {
  test("is a syntactically valid inline script that cannot close its own tag", () => {
    expect(() => new Function(themeScript)).not.toThrow();
    expect(themeScript).not.toContain("</script");
    expect(themeScript).toContain('"il-theme"');
    expect(themeScript).toContain('"data-theme"');
  });

  function runScript(pathname: string, stored: string | null, dark: boolean) {
    const root = {
      attributes: {} as Record<string, string>,
      style: {} as Record<string, string>,
    };
    const appended: { name?: string; content?: string }[] = [];
    const document = {
      documentElement: {
        setAttribute: (name: string, value: string) =>
          void (root.attributes[name] = value),
        style: root.style,
      },
      createElement: () => ({}),
      head: {
        appendChild: (node: { name?: string; content?: string }) =>
          void appended.push(node),
      },
    };
    new Function(
      "location",
      "localStorage",
      "matchMedia",
      "document",
      themeScript,
    )(
      { pathname },
      { getItem: () => stored },
      () => ({ matches: dark }),
      document,
    );
    return { root, appended };
  }

  test("applies the stored choice on an app route before the first paint", () => {
    const { root, appended } = runScript("/dashboard/chat", "dark", false);
    expect(root.attributes["data-theme"]).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(appended).toEqual([{ name: "theme-color", content: "#0f0f0f" }]);
  });

  test("ignores the stored choice off the app routes and follows the OS", () => {
    const { root, appended } = runScript("/", "dark", false);
    expect(root.attributes["data-theme"]).toBe("light");
    expect(appended[0]).toMatchObject({ content: "#ffffff" });
    expect(
      runScript("/about", "light", true).root.attributes["data-theme"],
    ).toBe("dark");
  });
});
