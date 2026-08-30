"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  applyTheme,
  getThemeSnapshot,
  parseThemeSnapshot,
  SERVER_THEME_SNAPSHOT,
  setThemePreference,
  subscribeToTheme,
} from "@/lib/theme";

/**
 * Keeps the document's theme in step with the browser's own state.
 *
 * It holds no state of its own. The choice lives in `localStorage` and the
 * fallback lives in the OS, so this reads both through
 * `useSyncExternalStore` rather than copying them into React — which is also
 * what makes a change in another tab, or the machine going dark at sunset,
 * arrive here without any extra wiring.
 *
 * It does not own the *first* application of the theme either: the blocking
 * script in the root layout does that, long before React runs. This exists so
 * a control can show which option is ticked and change it.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { resolved } = useTheme();

  // The one direction that is genuinely React → outside world: whatever the
  // store now says, put it on the document. Idempotent, so re-running it
  // over the script's own work costs nothing.
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  return children;
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
