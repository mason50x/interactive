/**
 * The account's accent: the palette, and how one colour becomes every token
 * the page mixes from it.
 *
 * Stored as an id in the preferences row rather than as a colour, which is
 * what lets the palette be retuned without rewriting anyone's row and makes
 * a bad value a fallback rather than an arbitrary colour on the page. See
 * `src/lib/preferences.ts` for the row and `preferencesScript` for how the
 * accent gets onto the document before React does.
 */

/**
 * One colour each, all cut to the same depth.
 *
 * The seven are a palette rather than seven independent picks: every one of
 * them is dark enough that a white label reads on it, which is what lets a single
 * ink serve the whole set. That constraint is why the emerald, the amber and
 * the cyan are not the bright mid-tones they would be on their own — those
 * sit light enough that white falls apart on them, and the fix for that is a
 * darker swatch, not a second, darker ink that makes one accent behave unlike
 * the other five.
 *
 * Everything an accent touches — the hover, the focus ring, the tinted surface
 * behind a highlighted row — is mixed from this single value against tokens
 * that already flip with the theme. That is what lets an accent be six
 * characters instead of a dozen hand-tuned hexes per theme, and why adding one
 * is a line rather than a design exercise. See `accentVariables`.
 */
export const accents = [
  { id: "blue", label: "Blue", color: "#3c85f7" },
  { id: "violet", label: "Violet", color: "#8b5cf6" },
  { id: "emerald", label: "Emerald", color: "#059669" },
  { id: "amber", label: "Amber", color: "#ca6a06" },
  { id: "rose", label: "Rose", color: "#f43f5e" },
  { id: "pink", label: "Pink", color: "#ec4899" },
  { id: "cyan", label: "Cyan", color: "#0891b2" },
  { id: "indigo", label: "Indigo", color: "#4f46e5" },
  { id: "teal", label: "Teal", color: "#0d9488" },
  { id: "green", label: "Green", color: "#16a34a" },
  { id: "orange", label: "Orange", color: "#ea580c" },
  { id: "red", label: "Red", color: "#dc2626" },
  { id: "fuchsia", label: "Fuchsia", color: "#c026d3" },
  { id: "slate", label: "Slate", color: "#475569" },
] as const;

export type AccentPresetId = (typeof accents)[number]["id"];

/**
 * A preset's id, or a colour of the account's own as `#rrggbb`.
 *
 * A custom colour is the one case where the palette's promise — white always
 * reads on it — cannot be kept by construction, so its ink is worked out from
 * the colour itself; see `accentInk`.
 */
export type AccentId = AccentPresetId | `#${string}`;

const HEX = /^#[0-9a-f]{6}$/i;

export function isCustomAccent(value: unknown): value is `#${string}` {
  return typeof value === "string" && HEX.test(value);
}

/**
 * White, or near-black for a colour light enough that white falls apart on it.
 *
 * Written as one self-contained function so `preferencesScript` can carry it
 * as source: the pre-paint copy and this one cannot disagree about which ink
 * a custom accent gets. Every preset lands on white.
 */
export function accentInk(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const luma =
    ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  return luma > 165 ? "#0f0f0f" : "#ffffff";
}

/**
 * The brand blue is the default because it is the one the rest of the app
 * was drawn against; everything else here is a deviation someone asked for.
 */
export const DEFAULT_ACCENT: AccentId = "blue";

export function isAccentId(value: unknown): value is AccentId {
  return isCustomAccent(value) || accents.some((accent) => accent.id === value);
}

export function accentColor(id: AccentId): string {
  if (isCustomAccent(id)) return id.toLowerCase();
  return (accents.find((accent) => accent.id === id) ?? accents[0]).color;
}

/**
 * The custom properties an accent overrides, as `[name, value]` pairs.
 *
 * Each is mixed against a token rather than stated outright, so one hex covers
 * both themes:
 *
 *   - `--primary-hover` leans the accent towards `--foreground`, which is near
 *     black in light and near white in dark. The same declaration darkens the
 *     button on one theme and lightens it on the other, which is what a hover
 *     is meant to do in each.
 *   - `--accent` is shadcn's *subtle hover surface*, not the brand colour, so
 *     it is a whisper of the accent over `--background`.
 *   - `--ring` follows the accent exactly. A focus ring in last month's blue
 *     around this month's violet button is the tell that a theme is skin deep.
 *
 * The `--sidebar-*` twins are here because shadcn keeps a parallel set for
 * chrome, and the rail is where most of this is actually seen.
 */
function accentVariables(id: AccentId): [string, string][] {
  return accentVariablesFor(accentColor(id));
}

/**
 * The same list, for a colour rather than an id.
 *
 * Split out for `preferencesScript`, which builds the list once with a placeholder
 * where the hex goes and ships that instead of six expanded copies. Nothing
 * else should need it — an accent is an id everywhere but there.
 */
export function accentVariablesFor(
  color: string,
  ink: string = accentInk(color),
): [string, string][] {
  const hover = `color-mix(in oklab, ${color} 86%, var(--foreground))`;
  const tint = `color-mix(in oklab, ${color} 12%, var(--background))`;
  const tintForeground = `color-mix(in oklab, ${color} 65%, var(--foreground))`;

  return [
    ["--primary", color],
    ["--primary-foreground", ink],
    ["--sidebar-primary-foreground", ink],
    ["--primary-hover", hover],
    ["--ring", color],
    ["--accent", tint],
    ["--accent-foreground", tintForeground],
    ["--sidebar-primary", color],
    ["--sidebar-accent", tint],
    ["--sidebar-accent-foreground", tintForeground],
    ["--sidebar-ring", color],
    ["--chart-1", color],
  ];
}

/**
 * Writes the accent onto the document, where every token above reads it.
 *
 * `blue` is applied as a removal rather than as its own hex: the stylesheet
 * already says blue, and clearing the inline properties is what lets the
 * default follow the stylesheet if it is ever retuned.
 */
export function applyAccent(id: AccentId): void {
  const root = document.documentElement;

  for (const [name, value] of accentVariables(id)) {
    if (id === DEFAULT_ACCENT) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
}
