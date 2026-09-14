import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  isTabMaskId,
  NO_TAB_MASK,
  TAB_MASK_SCRIPT_CONSTANTS,
  tabMaskAssets,
  tabMasks,
} from "@/lib/tab-mask";

const withTitle = tabMasks.filter(
  (mask): mask is Extract<(typeof tabMasks)[number], { title: string }> =>
    "title" in mask,
);

describe("isTabMaskId", () => {
  test.each([
    ["none", true],
    ["docs", true],
    ["classroom", true],
    ["gmail", true],
    ["khan", true],
    ["google", true],
    ["Docs", false],
    ["off", false],
    ["", false],
    [null, false],
    [undefined, false],
    [3, false],
    [{ id: "docs" }, false],
  ])("%j is a mask id: %s", (value, expected) => {
    expect(isTabMaskId(value)).toBe(expected);
  });
});

describe("tabMaskAssets", () => {
  test("none and unknown ids both fall back to null", () => {
    expect(NO_TAB_MASK).toBe("none");
    expect(tabMaskAssets("none")).toBeNull();
    expect(tabMaskAssets("myspace")).toBeNull();
    expect(tabMaskAssets("")).toBeNull();
  });

  test("a known id gives the title and icon the tab wears", () => {
    expect(tabMaskAssets("docs")).toEqual({
      title: "Untitled document - Google Docs",
      icon: "/brand/escape/docs.png",
    });
    for (const mask of withTitle) {
      expect(tabMaskAssets(mask.id)).toEqual({
        title: mask.title,
        icon: mask.icon,
      });
    }
  });
});

describe("tabMasks", () => {
  test("off leads the list with neither title nor icon, and ids are unique", () => {
    expect(tabMasks[0]).toEqual({ id: "none", label: "Off" });
    expect(new Set(tabMasks.map((mask) => mask.id)).size).toBe(tabMasks.length);
    expect(withTitle).toHaveLength(tabMasks.length - 1);
  });

  test("every icon is a file served from public/", () => {
    for (const mask of withTitle) {
      expect(mask.icon).toMatch(/^\/brand\/escape\/.+\.png$/);
      expect(
        existsSync(resolve(process.cwd(), "public", mask.icon.slice(1))),
      ).toBe(true);
    }
  });
});

describe("TAB_MASK_SCRIPT_CONSTANTS", () => {
  test("the table has one row per mask with a title, as [title, icon]", () => {
    const { table } = TAB_MASK_SCRIPT_CONSTANTS;
    expect(Object.keys(table).sort()).toEqual(
      withTitle.map((mask) => mask.id).sort(),
    );
    expect(table).not.toHaveProperty("none");
    for (const mask of withTitle) {
      expect(table[mask.id]).toEqual([mask.title, mask.icon]);
    }
  });

  test("the selector excludes our own link and the parked rel is not an icon", () => {
    const {
      realIconSelector,
      maskLinkAttribute,
      parkedRel,
      relStashAttribute,
      titleStashAttribute,
    } = TAB_MASK_SCRIPT_CONSTANTS;
    expect(realIconSelector).toContain(`:not([${maskLinkAttribute}])`);
    expect(realIconSelector).toContain('link[rel~="icon"]');
    expect(realIconSelector).toContain('link[rel="apple-touch-icon"]');
    expect(parkedRel).not.toMatch(/icon/);
    expect(
      new Set([maskLinkAttribute, relStashAttribute, titleStashAttribute]).size,
    ).toBe(3);
    for (const attribute of [
      maskLinkAttribute,
      relStashAttribute,
      titleStashAttribute,
    ]) {
      expect(attribute).toMatch(/^data-[a-z-]+$/);
    }
  });
});
