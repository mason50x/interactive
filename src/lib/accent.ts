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
] as const;

/**
 * The ink on top of any of them. One value, not a column in the table above:
 * the palette is chosen so this is always the right answer.
 */
const ACCENT_INK = "#ffffff";

export type AccentId = (typeof accents)[number]["id"];

/**
 * The brand blue is the default because it is the one the rest of the app
 * was drawn against; everything else here is a deviation someone asked for.
 */
export const DEFAULT_ACCENT: AccentId = "blue";

export function isAccentId(value: unknown): value is AccentId {
  return accents.some((accent) => accent.id === value);
}

function accentColor(id: AccentId): string {
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
export function accentVariablesFor(color: string): [string, string][] {
  const hover = `color-mix(in oklab, ${color} 86%, var(--foreground))`;
  const tint = `color-mix(in oklab, ${color} 12%, var(--background))`;
  const tintForeground = `color-mix(in oklab, ${color} 65%, var(--foreground))`;

  return [
    ["--primary", color],
    ["--primary-foreground", ACCENT_INK],
    ["--sidebar-primary-foreground", ACCENT_INK],
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
