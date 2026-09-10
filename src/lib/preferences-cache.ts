import { readStorage, removeStorage, writeStoredJson } from "@/lib/storage";
import { type Preferences, resolvePreferences } from "@/lib/preferences";

/**
 * The browser's copy of the preferences row.
 *
 * A cache of the server's answer, not a second source of truth: written from
 * a row that came back from Convex, read only until one arrives. Without it
 * every refresh is spent in the default blue for the length of the Clerk and
 * Convex handshake, which is a visible repaint of the whole page for anyone
 * who chose otherwise. `preferencesScript` reads the same key before the
 * first paint; `PreferencesProvider` reads it on mount and corrects it the
 * moment the subscription lands.
 */

/**
 * Where the last row this browser saw is kept.
 *
 * A cache of the server's answer, not a place a setting is ever *made*: it is
 * written from a row that came back from Convex and read only while no such
 * row has arrived yet. The page still writes to Convex and nowhere else, so
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
 */
export function readCachedPreferences(): string | null {
  return readStorage(PREFERENCES_STORAGE_KEY);
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

/** Best-effort: the settings still apply for this page view either way, and
 *  the only cost of a lost write is the next refresh starting on the defaults. */
export function cachePreferences(preferences: Preferences): void {
  writeStoredJson(PREFERENCES_STORAGE_KEY, preferences);
}

export function clearCachedPreferences(): void {
  removeStorage(PREFERENCES_STORAGE_KEY);
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
