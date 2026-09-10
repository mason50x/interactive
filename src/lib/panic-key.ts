/**
 * The panic key: where it can send the page, how a keystroke is written
 * down, and which destinations are safe to be sent to.
 *
 * All of it pure, so the recorder in the settings sheet and the listener in
 * the activity frame read one definition of a combo. The server checks the
 * destination too, in `convex/preferences.ts`; this is the copy that keeps
 * the page from accepting something it would then have to explain.
 */

/** The empty document every browser already has. See `panicPresets`. */
export const BLANK_PAGE = "about:blank";

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
 * recorder still takes it — it is the user's key — but this is what the page
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
 * that keeps the page from accepting something it would then have to explain.
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
