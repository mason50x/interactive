"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  applyTheme,
  usesAppTheme,
  readStoredPreference,
  resolveTheme,
  getThemeSnapshot,
  parseThemeSnapshot,
  SERVER_THEME_SNAPSHOT,
  setThemePreference,
  subscribeToTheme,
} from "@/lib/theme";

/** Keeps every route in sync with its theme policy, including client navigation. */
export function ThemeProvider() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const update = () => {
      const preference = usesAppTheme(pathname)
        ? readStoredPreference()
        : "system";
      applyTheme(resolveTheme(preference));
    };
    update();
    return subscribeToTheme(update);
  }, [pathname]);

  return null;
}

/**
 * Reads the theme, and returns the setter for it.
 *
 * There is no context: the store is a module, so any component can subscribe
 * to it directly and they all see the same snapshot.
 */
export function useTheme() {
  const snapshot = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    // The server has no storage and no `matchMedia`. React hydrates against
    // this value and then immediately re-renders with the real one.
    () => SERVER_THEME_SNAPSHOT,
  );

  return {
    ...parseThemeSnapshot(snapshot),
    setPreference: setThemePreference,
  };
}
