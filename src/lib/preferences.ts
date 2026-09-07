/**
 * The settings behind the account menu's sheet: what they are, and how a
 * stored row becomes something the page can use.
 *
 * Convex is the store — a live subscription, so a change made in one tab is on
 * the page in the other without anything here arranging it — and
 * `convex/preferences.ts` is the only thing that persists. What lives in this
 * file is the vocabulary: the defaults, the palette, the panic-key presets,
 * and the pure functions that turn a row into custom properties or a keystroke
 * into a string. The tab masks are the one part kept elsewhere — they are a
 * table plus a fair amount of DOM, and they live in `src/lib/tab-mask.ts`.
 *
 * The one other copy of the answer is a cache rather than a second source of
 * truth: the last row this browser saw, in `localStorage`, written only from a
 * row and read only until one arrives. Without it every refresh is spent in
 * the default blue for the length of the Clerk and Convex handshake, which is
 * a visible repaint of the whole page for anyone who chose otherwise — and a
 * masked tab spends that same window announcing the app by name. See
 * `PREFERENCES_STORAGE_KEY` and `preferencesScript`.
 *
 * The theme is deliberately not part of this. It is a property of the screen
 * you are looking at rather than of the account — a laptop in a bright room
 * and a phone in bed want different answers — so it stays device-local in
 * `src/lib/theme.ts`.
 */

import { LEARN_PATH_PREFIX } from "@/lib/learn";
import {
  isTabMaskId,
  NO_TAB_MASK,
  TAB_MASK_SCRIPT_CONSTANTS,
  type TabMaskId,
} from "@/lib/tab-mask";

export type Preferences = {
  /** The drifting mesh behind the dashboard rail. */
  constellation: boolean;
  /** An id from `accents`. */
  accent: AccentId;
  panicEnabled: boolean;
  /** A canonical combo (see `canonicalCombo`). */
  panicKey: string;
  panicUrl: string;
  /** An id from `tabMasks`; `none` is the app wearing its own name. */
  tabMask: TabMaskId;
};

/** The empty document every browser already has. See `panicPresets`. */
export const BLANK_PAGE = "about:blank";

/**
 * The brand blue is the default because it is the one the rest of the app was
 * drawn against; everything else here is a deviation someone asked for.
 *
 * The panic key ships off. It is a feature that takes the page away from you,
 * and one that fires on a keystroke nobody has agreed to yet is a bug wearing
 * a feature's clothes.
 *
 * `ctrl+shift+x` and not the more obvious `shift+escape`, which Chrome keeps
 * for its own task manager on Windows, Linux and ChromeOS — the page is never
 * told the key was pressed, so the default would have been dead on most of the
 * machines this runs on. The recorder will still take Shift+Esc from anyone
 * who wants it; it is only a bad thing to hand out unasked. What is left is
 * bound by nothing in any browser, and Ctrl, Shift and X sit in the same
 * bottom-left corner of the board, so it is a one-handed reach rather than a
 * shape to find under pressure.
 *
 * The tab mask ships off for a quieter reason: a product whose tab lies about
 * what it is by default is one nobody can recommend out loud. It is a thing to
 * reach for, not a thing to wake up inside of.
 */
export const defaultPreferences: Preferences = {
  constellation: true,
  accent: "blue",
  panicEnabled: false,
  panicKey: "ctrl+shift+x",
  panicUrl: BLANK_PAGE,
  tabMask: NO_TAB_MASK,
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
    tabMask: isTabMaskId(row.tabMask)
      ? row.tabMask
      : defaultPreferences.tabMask,
  };
}

/* -------------------------------------------------------------------------- */
/*  Accents                                                                    */
/* -------------------------------------------------------------------------- */

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
export const ACCENT_INK = "#ffffff";

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
  return accentVariablesFor(accentColor(id));
}

/**
 * The same list, for a colour rather than an id.
 *
 * Split out for `preferencesScript`, which builds the list once with a placeholder
 * where the hex goes and ships that instead of six expanded copies. Nothing
 * else should need it — an accent is an id everywhere but there.
 */
function accentVariablesFor(color: string): [string, string][] {
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
    if (id === defaultPreferences.accent) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
}

/* -------------------------------------------------------------------------- */
/*  The local copy                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Where the last row this browser saw is kept.
 *
 * A cache of the server's answer, not a place a setting is ever *made*: it is
 * written from a row that came back from Convex and read only while no such
 * row has arrived yet. The sheet still writes to Convex and nowhere else, so
 * the two cannot disagree about anything except how old they are — and the
 * moment the subscription lands, this one is overwritten.
 *
 * It is cleared on sign-out rather than left behind, so a shared laptop does
 * not open the next person's session in the last person's accent.
 */
export const PREFERENCES_STORAGE_KEY = "il-preferences";

/**
 * The raw string, not the object.
 *
 * `useSyncExternalStore` compares snapshots by identity and calls this on every
 * render; parsing here would hand it a new object each time and spin. The
 * parse belongs in a `useMemo` on the other side.
 *
 * Storage access is wrapped because it throws outright — not returns null — in
 * a browser set to block site data, exactly as in `src/lib/theme.ts`.
 */
export function readCachedPreferences(): string | null {
  try {
    return window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** `null` for nothing cached, or for anything that is not the shape we wrote. */
export function parseCachedPreferences(raw: string | null): Preferences | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return resolvePreferences(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function cachePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Ignored: the settings still apply for this page view, and the only cost
    // is the next refresh starting on the defaults again.
  }
}

export function clearCachedPreferences(): void {
  try {
    window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
  } catch {
    // Ignored, as above.
  }
}

/**
 * The `storage` event, which fires in the *other* tabs and never the one that
 * wrote the key. That is all this needs: a tab that wrote the key already has
 * the row it wrote from, and a tab that is still loading is the only one with
 * anything to learn here.
 */
export function subscribeToCachedPreferences(
  onStoreChange: () => void,
): () => void {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

/**
 * The accent and the tab mask, on the document before the first paint.
 *
 * This is the same trick `themeScript` plays and it is here for the same
 * reason: the settings arrive over a Convex subscription that cannot open
 * until Clerk has a token, which is hundreds of milliseconds after the page is
 * already on screen. A component cannot close that gap — React has no storage
 * to read on the server — so every refresh would paint the app blue and then
 * repaint it violet once the query landed, and every refresh would spend that
 * same window with the app's real name in the tab strip. The second of those
 * is the one that cannot be taken back: an accent that arrives late is a
 * flicker, and a title that arrives late has already been read.
 *
 * One script and one `JSON.parse` for both, because they are one cached row and
 * splitting them would only mean two `try` blocks racing the same paint. An
 * unknown accent does not stop the mask from being applied, and vice versa —
 * they are independent settings that happen to travel together.
 *
 * Neither half is written out a second time in any way that can drift.
 * `accentVariablesFor` is called once here with a placeholder where the hex
 * goes, and the script swaps the chosen colour in; the mask's attribute names,
 * selector and table come from `TAB_MASK_SCRIPT_CONSTANTS`. What is genuinely
 * duplicated is the shape of the mask's DOM calls, which is the same bargain
 * `themeScript` strikes with `applyTheme` and for the same reason — a
 * serialised function would carry names a bundler has already renamed.
 *
 * `PreferencesProvider` re-applies both on mount and corrects them if the cache
 * was stale, so the two can only ever differ for the length of one query.
 *
 * The default accent is deliberately absent from the table: the stylesheet
 * already says blue, so there is nothing for the script to do — which also
 * means a browser with no cache does exactly nothing, which is the right
 * answer for a first visit. `none` is absent from the mask table for the same
 * reason.
 *
 * `/learn` is skipped from inside the script rather than by mounting it
 * somewhere that shell does not reach. It has to run in the root layout — the
 * only layout a client-side navigation never re-renders, and a `<script>` React
 * creates on the client is a tag that never executes — and the root layout is
 * shared with the activity shell, which is painted in nothing of ours and only
 * ever seen inside a frame, where it has no tab of its own to mask.
 */
const ACCENT_PLACEHOLDER = "__accent__";

const { maskLinkAttribute, relStashAttribute, titleStashAttribute, parkedRel } =
  TAB_MASK_SCRIPT_CONSTANTS;

export const preferencesScript = `(function(){try{var p=location.pathname;if(p===${JSON.stringify(
  LEARN_PATH_PREFIX,
)}||p.indexOf(${JSON.stringify(
  `${LEARN_PATH_PREFIX}/`,
)})===0)return;var r=localStorage.getItem(${JSON.stringify(
  PREFERENCES_STORAGE_KEY,
)});if(!r)return;var s=JSON.parse(r),d=document.documentElement,h=document.head;var c=${JSON.stringify(
  Object.fromEntries(
    accents
      .filter((accent) => accent.id !== defaultPreferences.accent)
      .map((accent) => [accent.id, accent.color]),
  ),
)}[s.accent];if(c){var v=${JSON.stringify(
  accentVariablesFor(ACCENT_PLACEHOLDER),
)};for(var i=0;i<v.length;i++){d.style.setProperty(v[i][0],v[i][1].split(${JSON.stringify(
  ACCENT_PLACEHOLDER,
)}).join(c))}}var m=${JSON.stringify(
  TAB_MASK_SCRIPT_CONSTANTS.table,
)}[s.tabMask];if(m){if(document.title)d.setAttribute(${JSON.stringify(
  titleStashAttribute,
)},document.title);document.title=m[0];var k=h.querySelectorAll(${JSON.stringify(
  TAB_MASK_SCRIPT_CONSTANTS.realIconSelector,
)});for(var j=0;j<k.length;j++){k[j].setAttribute(${JSON.stringify(
  relStashAttribute,
)},k[j].getAttribute("rel")||"icon");k[j].setAttribute("rel",${JSON.stringify(
  parkedRel,
)})}var l=document.createElement("link");l.setAttribute(${JSON.stringify(
  maskLinkAttribute,
)},"");l.setAttribute("rel","icon");l.setAttribute("type","image/png");l.setAttribute("href",m[1]);h.appendChild(l)}}catch(_){}})()`;

/* -------------------------------------------------------------------------- */
/*  The panic key                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The blank page the browser already has, and then somewhere plausible to be
 * found by someone standing behind you.
 *
 * `about:blank` is the default, and the one to reach for. It is the only
 * destination that costs nothing to arrive at: the browser holds it already,
 * so the swap happens in the same frame as the keystroke instead of after a
 * round trip, and because there is no round trip there is nothing to find
 * afterwards — no request, no history entry, no cached copy, no line in
 * anyone's log. Every other preset is a page that has to be fetched, which is
 * both a moment of the old one still on screen and a trail. They are the
 * softer answer rather than the safer one: a blank tab is plainly a blank tab,
 * and a decoy is what you want when the problem is the person behind you
 * rather than the machine in front of you.
 *
 * The http(s) ones are written in the form `new URL().toString()` produces —
 * trailing slash and all — because that is what comes back out of the
 * database: both this file and `convex/preferences.ts` normalise before
 * storing, and a preset written without the slash is one that can never match
 * the row it just wrote.
 *
 * `icon` is each site's own favicon, taken once and served from `public/` —
 * the picker is a grid of logos, and a logo fetched from the site it depicts
 * would announce that this panel is open to every destination on the list.
 * The blank page has no icon because there is no site to have one; the picker
 * draws a glyph in its place.
 */
export const panicPresets = [
  { label: "Blank page", url: BLANK_PAGE },
  {
    label: "Google Classroom",
    url: "https://classroom.google.com/",
    icon: "/brand/escape/classroom.png",
  },
  {
    label: "Google Docs",
    url: "https://docs.google.com/document/u/0/",
    icon: "/brand/escape/docs.png",
  },
  {
    label: "Gmail",
    url: "https://mail.google.com/",
    icon: "/brand/escape/gmail.png",
  },
  {
    label: "Khan Academy",
    url: "https://www.khanacademy.org/",
    icon: "/brand/escape/khan.png",
  },
  {
    label: "Google",
    url: "https://www.google.com/",
    icon: "/brand/escape/google.png",
  },
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
 *
 * `about:blank` is the one exception, and it is allowed by string equality
 * rather than by its scheme: the whole `about:` family is not being opened up
 * here, only the empty document itself.
 */
export function safePanicUrl(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed === BLANK_PAGE) return BLANK_PAGE;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * How anything gets the settings sheet open without owning it.
 *
 * The sheet is mounted by `UserMenu`, at the very bottom of the rail, because
 * that is where the gear that opens it lives. The rail's search is at the top
 * of the same column and has no way to reach that state — and threading a
 * provider through the layout for one boolean would be a context whose only
 * two participants are eight inches apart on the same screen.
 *
 * A window event lets callers depend only on this module, and
 * the menu listens and opens itself.
 */
const SETTINGS_EVENT = "50x:settings-request";

/** Ask the settings sheet to open. Nothing happens if the rail is not
 *  mounted, which is every page outside `/dashboard`. */
export function requestSettings() {
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

/** The menu's side of it. Returns the unsubscribe, for an effect's cleanup. */
export function onSettingsRequest(handler: () => void) {
  window.addEventListener(SETTINGS_EVENT, handler);
  return () => window.removeEventListener(SETTINGS_EVENT, handler);
}
