/**
 * The settings behind the account menu's sheet: what they are, and how a
 * stored row becomes something the page can use.
 *
 * There is no second copy of any of this. Convex is the store — a live
 * subscription, so a change made in one tab is on the page in the other
 * without anything here arranging it — and `convex/preferences.ts` is the only
 * thing that persists. What lives in this file is the vocabulary: the
 * defaults, the palette, the panic-key presets, and the pure functions that
 * turn a row into custom properties or a keystroke into a string.
 *
 * The theme is deliberately not part of this. It is a property of the screen
 * you are looking at rather than of the account — a laptop in a bright room
 * and a phone in bed want different answers — so it stays device-local in
 * `src/lib/theme.ts`.
 */

export type Preferences = {
  /** The drifting mesh behind the dashboard rail. */
  constellation: boolean;
  /** An id from `accents`. */
  accent: AccentId;
  panicEnabled: boolean;
  /** A canonical combo (see `canonicalCombo`). */
  panicKey: string;
  panicUrl: string;
};

/**
 * The brand blue is the default because it is the one the rest of the app was
 * drawn against; everything else here is a deviation someone asked for.
 *
 * The panic key ships off. It is a feature that takes the page away from you,
 * and one that fires on a keystroke nobody has agreed to yet is a bug wearing
 * a feature's clothes.
 */
export const defaultPreferences: Preferences = {
  constellation: true,
  accent: "blue",
  panicEnabled: false,
  panicKey: "shift+escape",
  panicUrl: "https://classroom.google.com/",
};

/**
 * A stored row, filled in.
 *
 * Every column is optional in the schema so that a row written by an older
 * client is still a valid row, and `null` covers both "signed out" and "has
 * never changed a setting". All three collapse here into one complete object,
 * which is the only shape anything downstream ever sees.
 */
export function resolvePreferences(
  row: Partial<Record<keyof Preferences, unknown>> | null | undefined,
): Preferences {
  if (!row) return defaultPreferences;

  return {
    constellation:
      typeof row.constellation === "boolean"
        ? row.constellation
        : defaultPreferences.constellation,
    accent: isAccentId(row.accent) ? row.accent : defaultPreferences.accent,
    panicEnabled:
      typeof row.panicEnabled === "boolean"
        ? row.panicEnabled
        : defaultPreferences.panicEnabled,
    panicKey:
      typeof row.panicKey === "string" && row.panicKey !== ""
        ? row.panicKey
        : defaultPreferences.panicKey,
    panicUrl:
      typeof row.panicUrl === "string" && row.panicUrl !== ""
        ? row.panicUrl
        : defaultPreferences.panicUrl,
  };
}

/* -------------------------------------------------------------------------- */
/*  Accents                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One colour each, and the ink that goes on top of it.
 *
 * `on` is not a matter of taste. White reads on the blue, the violet and the
 * rose and does not read on the amber, the emerald or the cyan — those are
 * light enough that a white label on a filled button falls below the contrast
 * a person can actually read. It is stated per accent rather than computed,
 * because a luminance threshold picks the wrong side of the line for exactly
 * the colours that sit near it, which is all three of those.
 *
 * Everything an accent touches — the hover, the focus ring, the tinted surface
 * behind a highlighted row — is mixed from this single value against tokens
 * that already flip with the theme. That is what lets an accent be six
 * characters instead of a dozen hand-tuned hexes per theme, and why adding one
 * is a line rather than a design exercise. See `accentVariables`.
 */
export const accents = [
  { id: "blue", label: "Blue", color: "#3c85f7", on: "#ffffff" },
  { id: "violet", label: "Violet", color: "#8b5cf6", on: "#ffffff" },
  { id: "emerald", label: "Emerald", color: "#10b981", on: "#04231a" },
  { id: "amber", label: "Amber", color: "#f59e0b", on: "#291a00" },
  { id: "rose", label: "Rose", color: "#f43f5e", on: "#ffffff" },
  { id: "cyan", label: "Cyan", color: "#06b6d4", on: "#032329" },
] as const;

export type AccentId = (typeof accents)[number]["id"];

export function isAccentId(value: unknown): value is AccentId {
  return accents.some((accent) => accent.id === value);
}

export function accentColor(id: AccentId): string {
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
export function accentVariables(id: AccentId): [string, string][] {
  const color = accentColor(id);
  const hover = `color-mix(in oklab, ${color} 86%, var(--foreground))`;
  const tint = `color-mix(in oklab, ${color} 12%, var(--background))`;
  const tintForeground = `color-mix(in oklab, ${color} 65%, var(--foreground))`;

  const on = (accents.find((accent) => accent.id === id) ?? accents[0]).on;

  return [
    ["--primary", color],
    ["--primary-foreground", on],
    ["--sidebar-primary-foreground", on],
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
    if (id === defaultPreferences.accent) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
}

/* -------------------------------------------------------------------------- */
/*  The panic key                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Somewhere plausible to be found, at a glance, by someone standing behind
 * you. A blank page would be the giveaway.
 *
 * Written in the form `new URL().toString()` produces — trailing slash and
 * all — because that is what comes back out of the database: both this file
 * and `convex/preferences.ts` normalise before storing, and a preset written
 * without the slash is one that can never match the row it just wrote.
 */
export const panicPresets = [
  { label: "Google Classroom", url: "https://classroom.google.com/" },
  { label: "Google Docs", url: "https://docs.google.com/document/u/0/" },
  { label: "Gmail", url: "https://mail.google.com/" },
  { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Main_Page" },
  { label: "Khan Academy", url: "https://www.khanacademy.org/" },
  { label: "Google", url: "https://www.google.com/" },
] as const;

const MODIFIER_KEYS = ["control", "alt", "shift", "meta"];

/**
 * A keystroke, written down.
 *
 * Modifiers always in this order, always lower case, so the string is both
 * what gets stored and what gets compared — there is no second representation
 * to keep in step. The key itself is `KeyboardEvent.key` lowercased, which is
 * the character *produced* rather than the button pressed: someone on a French
 * layout sets the key their fingers found, not the one a US keyboard would
 * have put there.
 *
 * `null` for a modifier held on its own, which is a combo in progress rather
 * than a combo.
 */
export function canonicalCombo(
  event: Pick<
    KeyboardEvent,
    "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
  >,
): string | null {
  const key = event.key.toLowerCase();
  if (MODIFIER_KEYS.includes(key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (event.metaKey) parts.push("meta");
  parts.push(key === " " ? "space" : key);

  return parts.join("+");
}

const KEY_LABELS: Record<string, string> = {
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "⌘",
  escape: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  space: "Space",
};

/** The combo as a person reads it. */
export function comboParts(combo: string): string[] {
  if (!combo) return [];
  return combo
    .split("+")
    .map(
      (part) =>
        KEY_LABELS[part] ??
        (part.length === 1
          ? part.toUpperCase()
          : part.charAt(0).toUpperCase() + part.slice(1)),
    );
}

/**
 * A bare letter or digit is a combo that fires while you are typing. The
 * recorder still takes it — it is the user's key — but this is what the sheet
 * warns on.
 */
export function isRiskyCombo(combo: string): boolean {
  return combo.length === 1 && /[a-z0-9]/.test(combo);
}

/**
 * A destination has to be a page, not a scheme.
 *
 * `javascript:` and `data:` are the ones that matter — this string is handed
 * to `location.replace` from the app's own origin, which would run them as us.
 * The server checks this too, in `convex/preferences.ts`; this is the copy
 * that keeps the sheet from accepting something it would then have to explain.
 */
export function safePanicUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
