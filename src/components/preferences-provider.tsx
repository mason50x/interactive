"use client";

import { useMutation, useQuery } from "convex/react";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  applyAccent,
  canonicalCombo,
  defaultPreferences,
  resolvePreferences,
  safePanicUrl,
  type Preferences,
} from "@/lib/preferences";
import { api } from "../../convex/_generated/api";

type PreferencesContextValue = {
  preferences: Preferences;
  /** Writes one or more settings. Lands on the page before the server sees it. */
  update: (patch: Partial<Preferences>) => void;
};

const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: defaultPreferences,
  update: () => {},
});

/**
 * The account's settings, live, plus the two things that have to happen to the
 * whole document when they change.
 *
 * There is no local copy and no sync: `api.preferences.mine` is a subscription,
 * so a change made on a phone is on this page a moment later, and a change made
 * in this tab is on the other one without either of them knowing about the
 * other. That is also why the setter here is a mutation with an optimistic
 * update rather than a `useState` — the switch flips on the same frame it is
 * clicked, and the server's answer replaces the guess when it lands, or undoes
 * it if the write failed.
 *
 * The cost of having no local copy is a first paint in the default blue for
 * whoever has chosen otherwise: the accent cannot be on the document before
 * the query that names it has resolved. The alternative is a second store to
 * keep in step, and a wrong accent for a moment is cheaper than two sources of
 * truth for the life of the app.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const row = useQuery(api.preferences.mine);

  const save = useMutation(api.preferences.save).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.preferences.mine, {});
      store.setQuery(
        api.preferences.mine,
        {},
        {
          // `??` and not `||`: `false` is a value here, not an absence.
          constellation: args.constellation ?? current?.constellation,
          accent: args.accent ?? current?.accent,
          panicEnabled: args.panicEnabled ?? current?.panicEnabled,
          panicKey: args.panicKey ?? current?.panicKey,
          panicUrl: args.panicUrl ?? current?.panicUrl,
        },
      );
    },
  );

  // `undefined` is Convex still loading and `null` is signed out or never
  // changed anything. Both mean "the defaults", which is what this collapses
  // them to.
  const preferences = useMemo(() => resolvePreferences(row), [row]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      update: (patch) => {
        void save(patch);
      },
    }),
    [preferences, save],
  );

  useEffect(() => {
    applyAccent(preferences.accent);
  }, [preferences.accent]);

  usePanicKey(preferences);

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences() {
  return use(PreferencesContext);
}

/**
 * The panic key, listening on the whole document.
 *
 * Bound in the capture phase so it runs before anything on the page can
 * swallow the keystroke — a menu that traps Escape, an activity canvas that eats
 * every key — and deliberately *not* skipped while a field has focus. A panic
 * key that does not work because the cursor is in the search box is a panic
 * key that does not work; the sheet warns about bare letters for exactly this
 * reason, rather than quietly refusing to fire.
 *
 * `replace` rather than `assign`: the page you were on should not be one Back
 * press away.
 *
 * The one place it cannot reach is inside an activity. Activities run in a frame on
 * their own origin, and the browser gives their keystrokes to that document
 * alone — no listener here can see them, and nothing on this side can inject
 * one there. The frame has to lose focus first, which a click anywhere in the
 * app chrome does.
 */
function usePanicKey({ panicEnabled, panicKey, panicUrl }: Preferences) {
  useEffect(() => {
    if (!panicEnabled || !panicKey) return;

    const destination = safePanicUrl(panicUrl);
    if (!destination) return;

    function onKeyDown(event: KeyboardEvent) {
      if (canonicalCombo(event) !== panicKey) return;
      event.preventDefault();
      window.location.replace(destination as string);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [panicEnabled, panicKey, panicUrl]);
}
