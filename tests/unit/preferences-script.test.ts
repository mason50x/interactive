import { describe, expect, test } from "vitest";
import { accents } from "@/lib/accent";
import { preferencesScript } from "@/lib/preferences-script";

type FakeLink = Record<string, string>;

function runScript(pathname: string, cached: string | null, title = "Home") {
  const properties = new Map<string, string>();
  const rootAttributes: Record<string, string> = {};
  const appended: FakeLink[] = [];
  const realIcon: FakeLink = { rel: "icon" };
  const document = {
    title,
    documentElement: {
      style: {
        setProperty: (name: string, value: string) =>
          void properties.set(name, value),
      },
      setAttribute: (name: string, value: string) =>
        void (rootAttributes[name] = value),
    },
    head: {
      querySelectorAll: () => [
        {
          getAttribute: (name: string) => realIcon[name] ?? null,
          setAttribute: (name: string, value: string) =>
            void (realIcon[name] = value),
        },
      ],
      appendChild: (node: FakeLink) => void appended.push(node),
    },
    createElement: () => {
      const link: FakeLink = {};
      return {
        setAttribute: (name: string, value: string) =>
          void (link[name] = value),
        attributes: link,
      };
    },
  };
  new Function("location", "localStorage", "document", preferencesScript)(
    { pathname },
    { getItem: () => cached },
    document,
  );
  return {
    properties,
    rootAttributes,
    realIcon,
    appended: appended.map(
      (node) => (node as unknown as { attributes: FakeLink }).attributes,
    ),
    title: document.title,
  };
}

describe("preferencesScript", () => {
  test("parses as JavaScript and cannot close its own script tag", () => {
    expect(() => new Function(preferencesScript)).not.toThrow();
    expect(preferencesScript).not.toContain("</script");
    expect(preferencesScript).toContain('"il-preferences"');
  });

  test("the default accent and the off mask are absent, so an empty cache does nothing", () => {
    expect(preferencesScript).not.toContain('"blue"');
    expect(preferencesScript).not.toContain('"none"');
    const result = runScript("/dashboard", null);
    expect(result.properties.size).toBe(0);
    expect(result.appended).toEqual([]);
    expect(result.title).toBe("Home");
  });

  test("a cached accent lands on the document with the hex substituted in", () => {
    const violet = accents.find((accent) => accent.id === "violet")!;
    const { properties } = runScript(
      "/dashboard/chat",
      JSON.stringify({ accent: "violet", tabMask: "none" }),
    );
    expect(properties.size).toBe(12);
    expect(properties.get("--primary")).toBe(violet.color);
    expect(properties.get("--primary-hover")).toBe(
      `color-mix(in oklab, ${violet.color} 86%, var(--foreground))`,
    );
    for (const value of properties.values())
      expect(value).not.toContain("__accent__");
  });

  test("a cached mask parks the real icon, adds ours, and stashes the title", () => {
    const result = runScript(
      "/dashboard",
      JSON.stringify({ accent: "blue", tabMask: "docs" }),
    );
    expect(result.properties.size).toBe(0);
    expect(result.title).toBe("Untitled document - Google Docs");
    expect(result.rootAttributes["data-tab-mask-title"]).toBe("Home");
    expect(result.realIcon).toEqual({
      rel: "x-tab-mask",
      "data-tab-mask-rel": "icon",
    });
    expect(result.appended).toEqual([
      {
        "data-tab-mask": "",
        rel: "icon",
        type: "image/png",
        href: "/brand/escape/docs.png",
      },
    ]);
  });

  test("the activity shell under /learn is left alone", () => {
    const cached = JSON.stringify({ accent: "rose", tabMask: "gmail" });
    for (const pathname of ["/learn", "/learn/some-activity"]) {
      const result = runScript(pathname, cached);
      expect(result.properties.size).toBe(0);
      expect(result.title).toBe("Home");
    }
    expect(runScript("/learning", cached).properties.size).toBe(12);
  });

  test("a corrupt cache or an unknown id is swallowed rather than thrown", () => {
    expect(() => runScript("/dashboard", "{not json")).not.toThrow();
    const result = runScript(
      "/dashboard",
      JSON.stringify({ accent: "teal", tabMask: "myspace" }),
    );
    expect(result.properties.size).toBe(0);
    expect(result.appended).toEqual([]);
  });
});
