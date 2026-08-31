"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  applyAccent,
  cachePreferences,
  canonicalCombo,
  clearCachedPreferences,
  defaultPreferences,
  parseCachedPreferences,
  readCachedPreferences,
  resolvePreferences,
  safePanicUrl,
  subscribeToCachedPreferences,
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
 * `api.preferences.mine` is the source of truth and it is a subscription, so a
 * change made on a phone is on this page a moment later, and a change made in
 * this tab is on the other one without either of them knowing about the other.
 * That is also why the setter here is a mutation with an optimistic update
 * rather than a `useState` — the switch flips on the same frame it is clicked,
 * and the server's answer replaces the guess when it lands, or undoes it if the
 * write failed.
 *
 * What the subscription cannot do is be there on the first frame. It opens
 * only once Clerk has handed Convex a token, and until then this component has
 * no idea whose settings it is holding — which used to mean every refresh
 * painted the app in the default blue and repainted it a moment later, and
 * meant the panic key did not fire in the window someone is most likely to
 * want it. So the last row this browser saw is kept in `localStorage` and used
 * as the answer for exactly that window: written only from a row that came
 * back from the server, read only until the next one does, and thrown away the
 * moment we know nobody is signed in. `accentScript` reads the same cache
 * before React is on the page at all.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const row = useQuery(api.preferences.mine);
  const { cached, cacheRead } = useCachedPreferences();

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

  // The cache stands in until the server has answered *as this account*.
  // `row` alone is not enough to tell that apart: the query runs before the
  // token arrives too, and a signed-in visitor gets a `null` for a moment that
  // means "we do not know who you are yet" rather than "you have no settings".
  // Once Convex knows there is nobody signed in, the defaults are the answer
  // and the cache is not consulted at all.
  const preferences = useMemo(() => {
    if (!authLoading && !isAuthenticated) return defaultPreferences;
    if (row === undefined || (row === null && authLoading)) {
      return cached ?? defaultPreferences;
    }
    return resolvePreferences(row);
  }, [authLoading, isAuthenticated, row, cached]);

  // Only ever written from a row, and only a real one: a `null` on the way to
  // being authenticated would otherwise overwrite a good accent with the
  // defaults, which is the flash this exists to remove.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      clearCachedPreferences();
      return;
    }
    if (row) cachePreferences(resolvePreferences(row));
  }, [authLoading, isAuthenticated, row]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      update: (patch) => {
        void save(patch);
      },
    }),
    [preferences, save],
  );

  // The document is already wearing `accentScript`'s answer, which came from
  // the same cache. Until storage has actually been read on this side — it has
  // not during the hydration render, where the snapshot is deliberately the
  // server's — applying anything would mean stripping that for a frame and
  // putting it straight back, which is the flash in miniature.
  useEffect(() => {
    if (!cacheRead) return;
    applyAccent(preferences.accent);
  }, [cacheRead, preferences.accent]);

  usePanicKey(preferences);

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences() {
  return use(PreferencesContext);
}

/**
 * The cached row, and whether storage has been looked at yet.
 *
 * `useSyncExternalStore` rather than a read in an effect: the server snapshot
 * is the honest "not read", React renders that during hydration and swaps to
 * the browser's value straight after, so a component that reads a setting
 * while rendering cannot produce a hydration mismatch. Subscribing also keeps
 * a tab that is still loading honest if another tab signs out underneath it.
 *
 * `undefined` and `null` are different answers here and the difference is the
 * whole point: `undefined` is "we have not looked", which is every render on
 * the server and the hydration render on the client, and `null` is "we looked
 * and there is nothing". Only the second is grounds for touching the document.
 */
function useCachedPreferences(): {
  cached: Preferences | null;
  cacheRead: boolean;
} {
  const raw = useSyncExternalStore(
    subscribeToCachedPreferences,
    readCachedPreferences,
    () => undefined,
  );

  return useMemo(
    () => ({
      cached: raw === undefined ? null : parseCachedPreferences(raw),
      cacheRead: raw !== undefined,
    }),
    [raw],
  );
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
 *
 * That click is not available in fullscreen, where there is no app chrome
 * left, so `ActivityFrame` carries the same destination as a button in the
 * control pill — inside the element that goes fullscreen, and visible without
 * opening anything, for exactly this gap. Any change to what the key does
 * belongs there too.
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
