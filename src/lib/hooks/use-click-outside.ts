import { useEffect, type RefObject } from "react";

/**
 * Calls `onOutside` for a pointer that lands anywhere but inside `ref`.
 *
 * `pointerdown` rather than `click`, so the panel is gone before the press
 * finishes and the thing under it receives a clean click of its own. Passing
 * `false` for `active` removes the listener entirely — a closed panel has no
 * business listening to the whole document.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = ref.current;
      if (root && !root.contains(event.target as Node)) onOutside();
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [ref, onOutside, active]);
}
