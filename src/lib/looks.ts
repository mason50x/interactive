import type { AccentId } from "@/lib/accent";
import type { CustomSettings } from "@/lib/customize";
import type { ThemePreference } from "@/lib/theme";

/**
 * Whole looks, one click each: a theme, an accent and the painted settings
 * that go with them, chosen to be seen together.
 *
 * A look is a starting point rather than a mode. Applying one writes its
 * values as if each had been picked by hand, so changing a single control
 * afterwards is just a change — there is no "custom look" state to fall into,
 * and the tile that matches what is on the page is ringed as chosen.
 */
export type Look = {
  id: string;
  label: string;
  theme: Exclude<ThemePreference, "system">;
  accent: AccentId;
  settings: Pick<
    CustomSettings,
    "radius" | "font" | "tint" | "pattern" | "frame"
  >;
};

export const looks: Look[] = [
  {
    id: "classic",
    label: "Classic",
    theme: "dark",
    accent: "blue",
    settings: {
      radius: "default",
      font: "inter",
      tint: "neutral",
      pattern: "dots",
      frame: "framed",
    },
  },
  {
    id: "paper",
    label: "Paper",
    theme: "light",
    accent: "slate",
    settings: {
      radius: "sharp",
      font: "serif",
      tint: "neutral",
      pattern: "lines",
      frame: "flush",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    theme: "dark",
    accent: "violet",
    settings: {
      radius: "round",
      font: "inter",
      tint: "tinted",
      pattern: "grid",
      frame: "floating",
    },
  },
  {
    id: "bubblegum",
    label: "Bubblegum",
    theme: "light",
    accent: "pink",
    settings: {
      radius: "round",
      font: "rounded",
      tint: "vivid",
      pattern: "dots",
      frame: "floating",
    },
  },
  {
    id: "terminal",
    label: "Terminal",
    theme: "dark",
    accent: "green",
    settings: {
      radius: "sharp",
      font: "mono",
      tint: "tinted",
      pattern: "grid",
      frame: "flush",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    theme: "dark",
    accent: "orange",
    settings: {
      radius: "soft",
      font: "system",
      tint: "vivid",
      pattern: "lines",
      frame: "framed",
    },
  },
];
