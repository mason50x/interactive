"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

/** Prefetch only on navigation intent. Visible links must not render every
 * destination in the background, especially in the activity catalogue. */
export function useWarmRoutes(current: string) {
  const router = useRouter();
  const warmed = useRef(new Set<string>());

  return useCallback(
    (href: string) => {
      const on = () => {
        if (href === current || document.visibilityState !== "visible") return;
        const connection = (
          navigator as Navigator & { connection?: { saveData?: boolean } }
        ).connection;
        if (connection?.saveData) return;
        const seen = warmed.current;
        if (seen.has(href)) return;
        seen.add(href);
        router.prefetch(href, {
          // Vinext defaults imperative prefetches to auto; these protected
          // routes need a full fetch for the intended navigation to reuse it.
          kind: "full",
          onInvalidate: () => seen.delete(href),
        } as Parameters<typeof router.prefetch>[1]);
      };
      // Disable Link's separate viewport prefetch; only these handlers warm it.
      return {
        prefetch: false as const,
        onPointerEnter: on,
        onPointerDown: on,
        onFocus: on,
      };
    },
    [current, router],
  );
}
