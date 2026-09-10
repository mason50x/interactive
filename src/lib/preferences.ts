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
import { channel } from "@/lib/events";
import { BLANK_PAGE } from "@/lib/panic-key";
import { isTabMaskId, NO_TAB_MASK, type TabMaskId } from "@/lib/tab-mask";

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
  accent: DEFAULT_ACCENT,
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

/**
 * How anything gets the account modal open without owning it.
 *
 * The modal's pages are registered by `UserMenu`, at the very bottom of the
 * rail, because that is where the row that opens it lives. The rail's search
 * is at the top of the same column and has no way to reach that — and
 * threading a provider through the layout for one function would be a context
 * whose only two participants are eight inches apart on the same screen.
 *
 * A window event lets callers depend only on this module, and the menu
 * listens and opens itself. See `useAccountModal`.
 */
const SETTINGS_EVENT = "50x:settings-request";

/**
 * The two pages a caller can ask for by name: the site's settings, which
 * is the modal's first page, and Clerk's own account page behind it. Security
 * is one click from either and nothing searches for it.
 */
export type SettingsPage = "settings" | "account";

const settingsChannel = channel<SettingsPage>(SETTINGS_EVENT);

/** Ask the account modal to open, on the settings page unless told
 *  otherwise. Nothing happens if the rail is not mounted, which is every page
 *  outside `/dashboard`. */
export function requestSettings(page: SettingsPage = "settings") {
  settingsChannel.request(page);
}

/** The menu's side of it. Returns the unsubscribe, for an effect's cleanup. */
export function onSettingsRequest(handler: (page: SettingsPage) => void) {
  return settingsChannel.subscribe((page) => handler(page ?? "settings"));
}
