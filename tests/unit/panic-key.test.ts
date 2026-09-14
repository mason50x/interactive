import { describe, expect, test } from "vitest";
import {
  BLANK_PAGE,
  canonicalCombo,
  comboParts,
  isRiskyCombo,
  panicPresets,
  safePanicUrl,
} from "@/lib/panic-key";

type Modifiers = Partial<
  Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">
>;

function keystroke(key: string, modifiers: Modifiers = {}) {
  return {
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
  };
}

describe("canonicalCombo", () => {
  test("modifiers are written in the order ctrl, alt, shift, meta", () => {
    const all = { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true };
    expect(canonicalCombo(keystroke("X", all))).toBe("ctrl+alt+shift+meta+x");
    expect(
      canonicalCombo(keystroke("x", { metaKey: true, ctrlKey: true })),
    ).toBe("ctrl+meta+x");
  });

  test.each(["Control", "Alt", "Shift", "Meta", "control", "META"])(
    "a bare modifier %s is a combo in progress and yields null",
    (key) => {
      expect(canonicalCombo(keystroke(key))).toBeNull();
      expect(
        canonicalCombo(keystroke(key, { ctrlKey: true, shiftKey: true })),
      ).toBeNull();
    },
  );

  test.each([
    [" ", {}, "space"],
    [" ", { ctrlKey: true }, "ctrl+space"],
    ["X", {}, "x"],
    ["Escape", { shiftKey: true }, "shift+escape"],
    ["ArrowUp", { altKey: true }, "alt+arrowup"],
    ["7", {}, "7"],
  ])("%j with %o is written %s", (key, modifiers, combo) => {
    expect(canonicalCombo(keystroke(key, modifiers as Modifiers))).toBe(combo);
  });
});

describe("comboParts", () => {
  test.each([
    ["", []],
    ["ctrl+shift+x", ["Ctrl", "Shift", "X"]],
    ["meta+arrowup", ["⌘", "↑"]],
    ["alt+arrowdown", ["Alt", "↓"]],
    ["arrowleft+arrowright", ["←", "→"]],
    ["escape", ["Esc"]],
    ["ctrl+space", ["Ctrl", "Space"]],
    ["f5", ["F5"]],
    ["pageup", ["Pageup"]],
  ])("%j reads as %j", (combo, parts) => {
    expect(comboParts(combo)).toEqual(parts);
  });
});

describe("isRiskyCombo", () => {
  test.each([
    ["a", true],
    ["z", true],
    ["0", true],
    ["9", true],
    ["-", false],
    ["A", false],
    ["", false],
    ["escape", false],
    ["ctrl+a", false],
    ["space", false],
  ])("%j is risky: %s", (combo, risky) => {
    expect(isRiskyCombo(combo)).toBe(risky);
  });
});

describe("safePanicUrl", () => {
  test("about:blank is allowed by string equality alone", () => {
    expect(BLANK_PAGE).toBe("about:blank");
    expect(safePanicUrl("about:blank")).toBe("about:blank");
    expect(safePanicUrl("  about:blank\n")).toBe("about:blank");
    expect(safePanicUrl("about:config")).toBeNull();
    expect(safePanicUrl("about:blank#x")).toBeNull();
    expect(safePanicUrl("ABOUT:BLANK")).toBeNull();
  });

  test.each([
    ["https://example.org", "https://example.org/"],
    ["http://example.org", "http://example.org/"],
    [
      "  https://Example.org/path?q=1#frag ",
      "https://example.org/path?q=1#frag",
    ],
    ["https://example.org:8443/a/../b", "https://example.org:8443/b"],
  ])("%j is normalised to %j", (input, output) => {
    expect(safePanicUrl(input)).toBe(output);
  });

  test.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "ftp://example.org/",
    "blob:https://example.org/uuid",
    "",
    "   ",
    "not a url",
    "example.org",
    "//example.org",
    "https://",
  ])("%j is refused", (input) => {
    expect(safePanicUrl(input)).toBeNull();
  });

  test("every preset round-trips through safePanicUrl unchanged", () => {
    for (const preset of panicPresets) {
      expect(safePanicUrl(preset.url)).toBe(preset.url);
    }
  });

  test("the blank page leads the presets and is the only one without an icon", () => {
    expect(panicPresets[0]).toEqual({ label: "Blank page", url: BLANK_PAGE });
    for (const preset of panicPresets.slice(1)) {
      expect(preset).toHaveProperty("icon");
      expect((preset as { icon: string }).icon).toMatch(
        /^\/brand\/escape\/.+\.png$/,
      );
    }
  });
});
