"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

function prefetchRoute(
  href: string,
  current: string,
  router: ReturnType<typeof useRouter>,
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

/** Warm selected top-level destinations on mount; other links warm on intent. */
export function useWarmRoutes(
  current: string,
  hotRoutes: readonly string[] = [],
) {
  const router = useRouter();
  const warmed = useRef(new Set<string>());

  useEffect(() => {
    for (const href of hotRoutes)
      prefetchRoute(href, current, router, warmed.current);
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
