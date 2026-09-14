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

/**
 * Whether storage can be reached at all. For the rare caller that must tell
 * "nothing stored" apart from "cannot look", which `readStorage` folds
 * together on purpose.
 */
export function storageAvailable(): boolean {
  try {
    void window.localStorage.length;
    return true;
  } catch {
    return false;
  }
}

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

/** Every key currently stored, or none when storage cannot be read. */
export function storageKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key !== null) keys.push(key);
    }
    return keys;
  } catch {
    return [];
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
