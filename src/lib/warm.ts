"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

type Router = ReturnType<typeof useRouter>;

/**
 * How long the browser may stay busy before a hot route is warmed anyway.
 * Long enough for the first paint and the Convex handshake to settle; short
 * enough that a route is usually warm before anyone has read the page.
 */
const IDLE_TIMEOUT_MS = 2500;

function prefetchRoute(
  href: string,
  current: string,
  router: Router,
  seen: Set<string>,
) {
  if (href === current || document.visibilityState !== "visible") return;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  if (connection?.saveData || seen.has(href)) return;
  seen.add(href);
  router.prefetch(href, {
    // Protected routes need a full payload, not their loading boundary.
    kind: "full",
    onInvalidate: () => seen.delete(href),
  } as Parameters<typeof router.prefetch>[1]);
}

/** Runs `task` once the browser is idle, or after the timeout regardless. */
function whenIdle(task: () => void): () => void {
  // Absent in Safari, which is why the timeout below exists at all.
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 400);
  return () => window.clearTimeout(id);
}

/**
 * Warming: fetching a route's payload before it is asked for, so the click
 * lands on something already here.
 *
 * Every prefetch is a render on the server, with the same session check and
 * the same CPU as the page itself, so which routes get one and when is a
 * budget rather than a nicety. This used to warm every destination in the
 * rail the moment the app mounted — seven full renders per page load, most
 * of them for pages that were never opened, all landing on the Worker at
 * once. Now:
 *
 * - `hotRoutes` are warmed one at a time, once the page is idle. Callers
 *   keep this list short: the destinations someone is likeliest to reach
 *   for next, not everything they could.
 * - Everything else warms on intent — hover, focus or a press — which
 *   still gives the fetch a hundred-odd milliseconds' head start on the
 *   click, and only ever pays for a route someone is about to want.
 *
 * `router.prefetch` puts the payload under the static `staleTimes` bucket
 * (see `next.config.ts`), so a warmed route stays warm for minutes rather
 * than for one click.
 */
export function useWarmRoutes(
  current: string,
  hotRoutes: readonly string[] = [],
) {
  const router = useRouter();
  const warmed = useRef(new Set<string>());

  useEffect(() => {
    const queue = hotRoutes.filter((href) => href !== current);
    if (queue.length === 0) return;
    let cancel: (() => void) | undefined;
    let index = 0;
    const next = () => {
      const href = queue[index++];
      if (href === undefined) return;
      prefetchRoute(href, current, router, warmed.current);
      cancel = whenIdle(next);
    };
    cancel = whenIdle(next);
    return () => cancel?.();
  }, [current, hotRoutes, router]);

  return useCallback(
    (href: string) => {
      // Disable Link's separate viewport prefetch; only these handlers warm it.
      return {
        prefetch: false as const,
        onPointerEnter: () =>
          prefetchRoute(href, current, router, warmed.current),
        onPointerDown: () =>
          prefetchRoute(href, current, router, warmed.current),
        onFocus: () => prefetchRoute(href, current, router, warmed.current),
      };
    },
    [current, router],
  );
}

/**
 * One route, warmed on demand — for a control that is not a `Link`, such as
 * a menu whose opening is the intent to go somewhere.
 */
export function usePrefetch() {
  const router = useRouter();
  const pathname = usePathname();
  const warmed = useRef(new Set<string>());
  return useCallback(
    (href: string) => prefetchRoute(href, pathname, router, warmed.current),
    [pathname, router],
  );
}
