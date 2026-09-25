/**
 * The settings on the account modal's first page: what they are, and how a
 * stored row becomes something the page can use.
 *
 * Convex is the store — a live subscription, so a change made in one tab is on
 * the page in the other without anything here arranging it — and
 * `convex/preferences.ts` is the only thing that persists. What lives in this
 * file is the vocabulary: the defaults, the palette, the panic-key presets,
 * and the pure functions that turn a row into custom properties or a keystroke
 * into a string. Each vocabulary has its own module — the accents in
 * `src/lib/accent.ts`, the panic key in `src/lib/panic-key.ts`, the tab
 * masks in `src/lib/tab-mask.ts` — and this one holds the row they meet in.
 *
 * The one other copy of the answer is a cache rather than a second source of
 * truth: the last row this browser saw, in `localStorage`, written only from a
 * row and read only until one arrives. See `src/lib/preferences-cache.ts`
 * and `src/lib/preferences-script.ts` for why it exists and how it reaches
 * the page before React does.
 *
 * The theme is deliberately not part of this. It is a property of the screen
 * you are looking at rather than of the account — a laptop in a bright room
 * and a phone in bed want different answers — so it stays device-local in
 * `src/lib/theme.ts`.
 */

import { type AccentId, DEFAULT_ACCENT, isAccentId } from "@/lib/accent";
import { BLANK_PAGE } from "@/lib/panic-key";
import { isLunchNumber, type LunchNumber } from "@/lib/school-schedule";
import { isTabMaskId, NO_TAB_MASK, type TabMaskId } from "@/lib/tab-mask";

export type Preferences = {
  /** An id from `accents`. */
  accent: AccentId;
  panicEnabled: boolean;
  /** A canonical combo (see `canonicalCombo`). */
  panicKey: string;
  panicUrl: string;
  /** An id from `tabMasks`; `none` is the app wearing its own name. */
  tabMask: TabMaskId;
  /** River Falls High School lunch, 1–3, or `null` until they pick one. */
  lunch: LunchNumber | null;
};

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
 * The tab mask is off here, which is what signed-out visitors and accounts
 * from before the default changed see. New accounts are given the Classroom
 * mask when their user row is created — see `disguiseNewAccount` in
 * `convex/users.ts` — so it is a stored choice they can turn off, not a
 * fallback.
 */
export const defaultPreferences: Preferences = {
  accent: DEFAULT_ACCENT,
  panicEnabled: false,
  panicKey: "ctrl+shift+x",
  panicUrl: BLANK_PAGE,
  tabMask: NO_TAB_MASK,
  lunch: null,
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
    lunch: isLunchNumber(row.lunch) ? row.lunch : defaultPreferences.lunch,
  };
}

/** The settings page or Clerk's account page in the account modal. */
export type SettingsPage = "settings" | "account";
