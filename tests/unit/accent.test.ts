import { describe, expect, test } from "vitest";
import {
  accents,
  accentVariablesFor,
  DEFAULT_ACCENT,
  isAccentId,
} from "@/lib/accent";

describe("accents", () => {
  test("the default is in the palette and every id is unique", () => {
    expect(isAccentId(DEFAULT_ACCENT)).toBe(true);
    expect(accents[0].id).toBe(DEFAULT_ACCENT);
    expect(new Set(accents.map((accent) => accent.id)).size).toBe(
      accents.length,
    );
  });

  test("every colour is a lowercase seven-character hex", () => {
    for (const accent of accents) {
      expect(accent.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(accent.label).not.toBe("");
    }
  });
});

describe("isAccentId", () => {
  test.each([
    ["blue", true],
    ["violet", true],
    ["cyan", true],
    ["Blue", false],
    ["teal", false],
    ["", false],
    [null, false],
    [undefined, false],
    [1, false],
  ])("%j is an accent id: %s", (value, expected) => {
    expect(isAccentId(value)).toBe(expected);
  });
});

describe("accentVariablesFor", () => {
  const color = "#123456";
  const variables = accentVariablesFor(color);
  const byName = new Map(variables);

  test("emits the twelve custom properties, each once", () => {
    expect(variables).toHaveLength(12);
    expect([...byName.keys()].sort()).toEqual(
      [
        "--primary",
        "--primary-foreground",
        "--sidebar-primary-foreground",
        "--primary-hover",
        "--ring",
        "--accent",
        "--accent-foreground",
        "--sidebar-primary",
        "--sidebar-accent",
        "--sidebar-accent-foreground",
        "--sidebar-ring",
        "--chart-1",
      ].sort(),
    );
  });

  test.each([
    "--primary",
    "--ring",
    "--sidebar-primary",
    "--sidebar-ring",
    "--chart-1",
  ])("%s follows the colour exactly", (name) => {
    expect(byName.get(name)).toBe(color);
  });

  test("the ink on the accent is white for both the button and the rail", () => {
    expect(byName.get("--primary-foreground")).toBe("#ffffff");
    expect(byName.get("--sidebar-primary-foreground")).toBe("#ffffff");
  });

  test("hover and tint are mixed against the theme tokens, not stated outright", () => {
    expect(byName.get("--primary-hover")).toBe(
      `color-mix(in oklab, ${color} 86%, var(--foreground))`,
    );
    expect(byName.get("--accent")).toBe(
      `color-mix(in oklab, ${color} 12%, var(--background))`,
    );
    expect(byName.get("--accent-foreground")).toBe(
      `color-mix(in oklab, ${color} 65%, var(--foreground))`,
    );
    expect(byName.get("--sidebar-accent")).toBe(byName.get("--accent"));
    expect(byName.get("--sidebar-accent-foreground")).toBe(
      byName.get("--accent-foreground"),
    );
  });

  test("a placeholder survives untouched so a script can substitute the hex later", () => {
    for (const [, value] of accentVariablesFor("__accent__")) {
      expect(value === "#ffffff" || value.includes("__accent__")).toBe(true);
    }
  });
});
