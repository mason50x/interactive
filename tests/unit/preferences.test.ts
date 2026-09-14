import { describe, expect, test } from "vitest";
import { DEFAULT_ACCENT } from "@/lib/accent";
import { BLANK_PAGE } from "@/lib/panic-key";
import { defaultPreferences, resolvePreferences } from "@/lib/preferences";
import { NO_TAB_MASK } from "@/lib/tab-mask";

describe("defaultPreferences", () => {
  test("the defaults are the brand accent, the blank page, and both disguises off", () => {
    expect(defaultPreferences).toEqual({
      constellation: true,
      accent: DEFAULT_ACCENT,
      panicEnabled: false,
      panicKey: "ctrl+shift+x",
      panicUrl: BLANK_PAGE,
      tabMask: NO_TAB_MASK,
    });
  });
});

describe("resolvePreferences", () => {
  test("no row at all is the defaults", () => {
    expect(resolvePreferences(null)).toEqual(defaultPreferences);
    expect(resolvePreferences(undefined)).toEqual(defaultPreferences);
    expect(resolvePreferences({})).toEqual(defaultPreferences);
  });

  test.each([
    ["constellation", false],
    ["accent", "violet"],
    ["panicEnabled", true],
    ["panicKey", "shift+escape"],
    ["panicUrl", "https://www.google.com/"],
    ["tabMask", "docs"],
  ] as const)(
    "a valid %s is kept while every other field defaults",
    (field, value) => {
      expect(resolvePreferences({ [field]: value })).toEqual({
        ...defaultPreferences,
        [field]: value,
      });
    },
  );

  test.each([
    ["constellation", "true"],
    ["constellation", 1],
    ["constellation", null],
    ["accent", "teal"],
    ["accent", ""],
    ["accent", 0],
    ["panicEnabled", "false"],
    ["panicEnabled", 0],
    ["panicKey", ""],
    ["panicKey", 42],
    ["panicKey", null],
    ["panicUrl", ""],
    ["panicUrl", ["https://example.org/"]],
    ["tabMask", "off"],
    ["tabMask", ""],
    ["tabMask", undefined],
  ] as const)(
    "%s = %j falls back to its default on its own",
    (field, value) => {
      expect(resolvePreferences({ [field]: value })).toEqual(
        defaultPreferences,
      );
    },
  );

  test("a partial row from an older client keeps its valid fields and fills the rest", () => {
    expect(
      resolvePreferences({
        accent: "rose",
        panicEnabled: true,
        panicKey: "",
        tabMask: "nope",
        extra: "ignored",
      } as Record<string, unknown>),
    ).toEqual({
      ...defaultPreferences,
      accent: "rose",
      panicEnabled: true,
    });
  });

  test("the result carries exactly the six preference keys", () => {
    const resolved = resolvePreferences({ unknown: 1 } as Record<
      string,
      unknown
    >);
    expect(Object.keys(resolved).sort()).toEqual(
      Object.keys(defaultPreferences).sort(),
    );
  });
});
