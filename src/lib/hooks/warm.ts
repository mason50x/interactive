"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/**
 * Warming routes before they are asked for.
 *
 * ## Why any of this is needed
 *
 * Every page under `/dashboard` calls `auth.protect()`, which reads cookies,
 * which makes the route dynamic. Next does not prefetch a dynamic route on its
 * own: the default `prefetch="auto"` fetches a dynamic route only as far as its
 * nearest `loading.js` boundary, and this app has none. So the rail's links
 * were prefetching *nothing*, and every click paid for a cold server render of
 * a Clerk session check before a single pixel moved.
 *
 * `router.prefetch` is the way out. It performs a **full** prefetch — the whole
 * route, dynamic or not — and the result lands in the client cache under the
 * `static` stale time rather than the `dynamic` one, which is the difference
 * between five minutes and not being cached at all. See `staleTimes` in
 * `next.config.ts`; the two are a pair, and raising one without the other
 * leaves warmed routes going cold the moment they arrive.
 *
 * ## Warming on intent, and warming on idle
 *
 * Both, because neither alone covers everyone. A pointer announces itself —
 * hovering a rail row is a few hundred milliseconds of free warning before the
 * click, which is usually the whole round trip. A finger announces nothing, so
 * on a touch screen the first signal is `pointerdown`, which buys only the tail
 * of the tap. The idle pass is what covers that case: once the page that just
 * arrived has settled, the few destinations in the rail are warmed in the
 * background, so the first tap of the session is already instant.
 *
 * The idle pass is affordable *because* the rail is short. This warms a fixed
 * set of a few app-level destinations and each one costs a server render, so
 * do not point it at a list — the catalogue's cards want intent-warming only,
 * which is what the returned handler is for.
 *
 * ## Not re-warming what is already warm
 *
 * A warmed href is remembered, so crossing the same row twenty times is one
 * prefetch and not twenty. What makes that safe is `onInvalidate`: Next calls
 * it when it suspects its copy has gone stale, and the entry is dropped, so the
 * next hover warms it again. That is a subscription to the real cache rather
 * than a TTL guessed here to match one — a guess would be a second copy of
 * `staleTimes` that nothing keeps in step.
 */

/**
 * Warms `hrefs` in the background, and returns the props that warm one on
 * intent. Spread the result onto anything that navigates:
 *
 * ```tsx
 * const warm = useWarmRoutes(NAV_HREFS, pathname);
 * <Link href={href} {...warm(href)} />
 * ```
 *
 * `hrefs` is a dependency of the idle pass, so it has to be a stable array —
 * a module constant like `NAV_HREFS`, or something held by `useMemo`. An array
 * built fresh in the render body re-runs the pass on every render.
 */
export function useWarmRoutes(hrefs: readonly string[], current: string) {
  const router = useRouter();

  // A ref and not state: nothing here is rendered, and warming during a render
  // pass would be a side effect in the middle of one.
  const warmed = useRef(new Set<string>());

  const warm = useCallback(
    (href: string) => {
      const seen = warmed.current;
      if (seen.has(href)) return;
      seen.add(href);
      router.prefetch(href, {
        // `full` is the whole point: `auto` on a dynamic route fetches only as
        // far as a `loading.js` boundary, and there is none, so it would fetch
        // nothing at all. The cast is because `kind` is typed as an enum Next
        // does not export from any public entry point — its own docs call
        // `prefetch` without the field. `"full"` is that enum's value.
        kind: "full",
        onInvalidate: () => {
          seen.delete(href);
        },
      } as Parameters<typeof router.prefetch>[1]);
    },
    [router],
  );

  useEffect(() => {
    // Someone paying by the megabyte did not ask for pages they may never open.
    // Intent-warming still works for them; only the speculative pass is
    // withheld.
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return;

    const pass = () => {
      for (const href of hrefs) {
        // The route already on the screen is skipped: prefetching the page you
        // are looking at is a server render whose result nothing reads.
        if (href !== current) warm(href);
      }
    };

    // Behind idle rather than fired on mount, so this queues behind whatever
    // the page that just arrived is still doing — hydration, the Convex
    // subscriptions, the first paint. The timeout is the promise that it
    // happens at all: a busy tab can withhold idle indefinitely, and a rail
    // that is warm only on quiet machines is warm exactly when it was not
    // needed. Safari was late to `requestIdleCallback`, so a timer stands in
    // where it is missing — the same delay, without the politeness.
    if (typeof requestIdleCallback === "function") {
      const idle = requestIdleCallback(pass, { timeout: 2000 });
      return () => cancelIdleCallback(idle);
    }

    const timer = setTimeout(pass, 2000);
    return () => clearTimeout(timer);
  }, [hrefs, current, warm]);

  // Three ways in, because they are three different amounts of warning and
  // whichever fires first wins. `pointerenter` is the mouse's; `focus` is the
  // keyboard's, arriving a Tab before the Enter; `pointerdown` is the touch
  // screen's, and is the last moment anything can be done. Warming is
  // idempotent, so a mouse firing all three still costs one prefetch.
  return useCallback(
    (href: string) => {
      const on = () => warm(href);
      return { onPointerEnter: on, onPointerDown: on, onFocus: on };
    },
    [warm],
  );
}
