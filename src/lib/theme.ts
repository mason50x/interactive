import { brand } from "@/lib/brand";

/**
 * What the user picked. `system` is the default and is not a colour — it is a
 * moving target that follows the OS, which is why it is kept separate from
 * the *resolved* theme below. Only the resolved value ever reaches the
 * document; `system` lives in storage and in the menu's checkmark.
 */
export const themePreferences = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof themePreferences)[number];

/** What the page is actually painted as, once `system` has been read. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "il-theme";
export const THEME_ATTRIBUTE = "data-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (themePreferences as readonly string[]).includes(value)
  );
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

/**
 * Storage access is wrapped because it throws outright — not returns null —
 * in a browser set to block site data, and a theme is never worth taking the
 * page down for. Every failure falls back to `system`.
 */
export function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function storePreference(preference: ThemePreference): void {
  try {
    // `system` is the absence of a choice, so it is stored as the absence of
    // a key. That way a user who goes back to it is not pinned to whatever
    // the OS happened to be on the day they chose.
    if (preference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Ignored: the theme still applies for this page view.
  }
}

/**
 * The theme as an external store, so React can read it with
 * `useSyncExternalStore` instead of mirroring it in state.
 *
 * The browser really is the source of truth here — `localStorage` holds the
 * choice and the OS holds the fallback — and both can change without React's
 * knowledge: another tab writing the key, or the machine flipping to dark at
 * sunset. Subscribing to them is what keeps every tab in step.
 *
 * The snapshot is a string so it stays referentially stable across reads; an
 * object would be a new one each time and re-render forever.
 */
export type ThemeSnapshot = `${ThemePreference}:${ResolvedTheme}`;

/** What the server sends. Corrected on the client's first read. */
export const SERVER_THEME_SNAPSHOT: ThemeSnapshot = "system:light";

const listeners = new Set<() => void>();

export function subscribeToTheme(onStoreChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  listeners.add(onStoreChange);
  // `storage` fires in the *other* tabs, never the one that wrote the key,
  // which is why our own writes go through the listener set below.
  window.addEventListener("storage", onStoreChange);
  media.addEventListener("change", onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
    media.removeEventListener("change", onStoreChange);
  };
}

export function getThemeSnapshot(): ThemeSnapshot {
  const preference = readStoredPreference();
  return `${preference}:${resolveTheme(preference)}`;
}

export function parseThemeSnapshot(snapshot: ThemeSnapshot): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
} {
  const [preference, resolved] = snapshot.split(":");
  return {
    preference: preference as ThemePreference,
    resolved: resolved as ResolvedTheme,
  };
}

/** Records the choice and tells every reader in this tab to look again. */
export function setThemePreference(preference: ThemePreference): void {
  storePreference(preference);
  for (const listener of listeners) listener();
}

/**
 * Writes the resolved theme to the document.
 *
 * Three things have to move together. The attribute drives every token in
 * `globals.css` and Tailwind's `dark:` variant. `color-scheme` drives what the
 * browser paints itself: scrollbars, form controls, the autofill sheet — CSS
 * variables cannot reach any of those. And `theme-color` is the mobile
 * browser's own chrome, which would otherwise sit at the wrong colour above
 * a page the user has explicitly overridden.
 */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.setAttribute(THEME_ATTRIBUTE, theme);
  root.style.colorScheme = theme;

  let meta = document.head.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute(
    "content",
    theme === "dark" ? brand.colors.themeDark : brand.colors.themeLight,
  );
}

/**
 * The same work as `applyTheme`, inlined into the document head so it runs
 * before the first paint.
 *
 * This has to be a blocking script rather than an effect: React does not run
 * on the server's HTML until hydration, so anything that waits for a
 * component would show a light page first and then snap to dark. Everything
 * it touches is re-derived by `ThemeProvider` on mount, so the two can never
 * drift — the values are interpolated from the constants above rather than
 * written out twice.
 */
export const themeScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var t=p==="light"||p==="dark"?p:(matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches?"dark":"light");var e=document.documentElement;e.setAttribute(${JSON.stringify(
  THEME_ATTRIBUTE,
)},t);e.style.colorScheme=t;var m=document.createElement("meta");m.name="theme-color";m.content=t==="dark"?${JSON.stringify(
  brand.colors.themeDark,
)}:${JSON.stringify(
  brand.colors.themeLight,
)};document.head.appendChild(m)}catch(_){}})()`;
