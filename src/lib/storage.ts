/**
 * `localStorage`, for a page that must work without it.
 *
 * Storage access throws outright — not returns null — in a browser set to
 * block site data, in a private window on some engines, and when the quota
 * is spent. None of the things this app keeps there (a theme, an accent, a
 * weather cache, a device preference) is worth taking the page down for, so
 * every read falls back and every write is best-effort. Callers say what the
 * fallback is; nothing here guesses.
 */

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Full, blocked, or unavailable. The page carries on without it.
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // As above.
  }
}

/** The parsed value under `key`, or `null` for nothing there or not JSON. */
export function readStoredJson<T>(key: string): T | null {
  const raw = readStorage(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStoredJson(key: string, value: unknown): void {
  writeStorage(key, JSON.stringify(value));
}
