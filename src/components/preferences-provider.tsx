"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { applyAccent } from "@/lib/accent";
import {
  applyDocumentSettings,
  type CustomSettings,
  customKeys,
  isCustomKey,
  resolveCustom,
} from "@/lib/customize";
import { HOME_HREF } from "@/lib/nav";
import { canonicalCombo, safePanicUrl } from "@/lib/panic-key";
import {
  defaultPreferences,
  type Preferences,
  resolvePreferences,
} from "@/lib/preferences";
import {
  cachePreferences,
  clearCachedPreferences,
  parseCachedPreferences,
  readCachedPreferences,
  subscribeToCachedPreferences,
} from "@/lib/preferences-cache";
import { tabMaskAssets, watchTabMask } from "@/lib/tab-mask";
import { api } from "@convex/_generated/api";

type PreferencesContextValue = {
  preferences: Preferences;
  /** Writes one or more settings. Lands on the page before the server sees it. */
  update: (patch: Partial<Preferences>) => void;
  /** The server has answered for this visitor, so a `null` is a real "unset". */
  loaded: boolean;
};

const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: defaultPreferences,
  update: () => {},
  loaded: false,
});

/**
 * The account's settings, live, plus the three things that have to happen to
 * the whole document when they change.
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
 * moment we know nobody is signed in. `preferencesScript` reads the same cache
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
          accent: args.accent ?? current?.accent,
          panicEnabled: args.panicEnabled ?? current?.panicEnabled,
          panicKey: args.panicKey ?? current?.panicKey,
          panicUrl: args.panicUrl ?? current?.panicUrl,
          tabMask: args.tabMask ?? current?.tabMask,
          lunch: args.lunch ?? current?.lunch,
          custom:
            args.custom === undefined
              ? current?.custom
              : { ...current?.custom, ...args.custom },
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
      loaded: !authLoading && row !== undefined,
      update: (patch) => {
        // The original columns go as themselves; everything from
        // `src/lib/customize.ts` rides in the `custom` record.
        const core: Record<string, unknown> = {};
        const custom: Record<string, CustomSettings[keyof CustomSettings]> = {};
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) continue;
          if (isCustomKey(key)) custom[key] = value as never;
          else if (key !== "lunch" || value) core[key] = value;
        }
        void save({
          ...(core as Parameters<typeof save>[0]),
          ...(Object.keys(custom).length ? { custom } : {}),
        });
      },
    }),
    [preferences, save, authLoading, row],
  );

  // The document is already wearing `preferencesScript`'s answer, which came
  // from the same cache. Until storage has actually been read on this side — it
  // has not during the hydration render, where the snapshot is deliberately the
  // server's — applying anything would mean stripping that for a frame and
  // putting it straight back, which is the flash in miniature.
  useEffect(() => {
    if (!cacheRead) return;
    applyAccent(preferences.accent);
  }, [cacheRead, preferences.accent]);

  // The mask is the same story with one addition: it has to be *held*. React
  // owns the `<title>` and the icon links, and every route in the signed-in app
  // declares a title of its own, so a mask written once on mount lasts until
  // the first click. `watchTabMask` writes it back — see `src/lib/tab-mask.ts`.
  // `away` is only listened for when a setting asks about it; see `useAway`.
  const away = useAway(
    preferences.maskWhen === "away" || preferences.privacyBlur,
  );
  const masked = preferences.maskWhen === "always" || away;

  useEffect(() => {
    if (!cacheRead) return;
    return watchTabMask(masked ? tabMaskAssets(preferences.tabMask) : null);
  }, [cacheRead, masked, preferences.tabMask]);

  // The painted settings. Built from the fields rather than passed whole so
  // the effect only runs when one of them actually changes.
  const painted = JSON.stringify(
    customKeys.map((key) => preferences[key as keyof Preferences]),
  );
  useEffect(() => {
    if (!cacheRead) return;
    applyDocumentSettings(resolveCustom(preferences));
    // `painted` is the dependency that says when; `preferences` is read for what.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheRead, painted]);

  useEffect(() => {
    const root = document.documentElement;
    if (preferences.privacyBlur && away) root.setAttribute("data-away", "");
    else root.removeAttribute("data-away");
  }, [preferences.privacyBlur, away]);

  useLeaveGuard(preferences.confirmLeave);
  useLanding(
    preferences.landing,
    cacheRead && (cached !== null || value.loaded),
  );
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
 * key that does not work because the cursor is in an input field is a panic
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
      // The whole point is to leave without a dialog in the way.
      leaving = true;
      window.location.replace(destination as string);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [panicEnabled, panicKey, panicUrl]);
}

/** Set on the way out by the panic key, so the leave guard stands aside. */
let leaving = false;

/**
 * "Ask before closing the tab": the browser's own leave dialog, which is the
 * only one a page is allowed to put in front of a close.
 */
function useLeaveGuard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (leaving) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled]);
}

/**
 * Whether this tab is out of sight: hidden behind another tab, or its window
 * no longer the one being used.
 *
 * Focus moving into an activity's frame blurs the window without the page
 * being any less in front of you, so a blur is only believed once
 * `document.hasFocus()` — which counts a focused child frame — agrees.
 */
function useAway(listening: boolean): boolean {
  const [away, setAway] = useState(false);

  useEffect(() => {
    if (!listening) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setAway(document.hidden || !document.hasFocus()),
      );
    };
    check();
    window.addEventListener("blur", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [listening]);

  return listening && away;
}

const LANDED_KEY = "il-landed";

/**
 * "Open to": the page a fresh tab starts on, when it is not Home.
 *
 * Every door into the app lands on Home — sign-in, `/`, the logo — and those
 * are decided on the server, which has no idea what this account picked. So
 * the choice is made here, once per tab: the first time the app is on screen
 * with settings to read, a tab that opened on Home is moved on. Every visit to
 * Home after that is one somebody asked for, and stays.
 */
function useLanding(landing: string, known: boolean) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!known) return;
    try {
      if (sessionStorage.getItem(LANDED_KEY)) return;
      sessionStorage.setItem(LANDED_KEY, "1");
    } catch {
      return;
    }
    if (pathname === HOME_HREF && landing !== HOME_HREF)
      router.replace(landing);
    // Decided once, on the first render that knows the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known]);
}
