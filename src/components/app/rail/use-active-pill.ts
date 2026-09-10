"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { navItems } from "@/lib/nav";

/**
 * Which row is lit, which row is current, and where the pill has to be.
 *
 * Exactly one item is lit: the one whose href is the *longest* prefix of the
 * current path. Testing each item on its own would light every ancestor too,
 * and since every route here sits under `/dashboard`, an item pointing at
 * the root would be lit on every page of the app.
 *
 * `litHref` is which row wears the pill. A click lights its row *now* and
 * lets the URL catch up, rather than the other way round: every route under
 * `/dashboard` reads cookies and so is rendered on demand, and until
 * `src/lib/warm.ts` has been round the rail the answer arrives some hundreds
 * of milliseconds after the click. Waiting for `pathname` to move means
 * waiting all of that with the rail showing the row you just left — which
 * reads as a click that missed, and gets clicked again.
 *
 * Only the pill and the ink follow this. `aria-current` stays on the route
 * actually being shown — `activeHref` — because that is what it means; a
 * screen reader saying "current page" of a page that has not arrived is a
 * lie, and a navigation that fails would leave it as one.
 *
 * `pill` is where the lit face has to be. Read off the row rather than
 * computed from the row height and the gap, so the two cannot drift apart:
 * the rows are laid out by Tailwind classes in `AppSidebar`, and arithmetic
 * here would be a second copy of them that nothing checks. `list` is the ref
 * the rows are measured under.
 */
export function useActivePill(pathname: string, pendingHref: string | null) {
  const list = useRef<HTMLUListElement>(null);
  const [pill, setPill] = useState<{ top: number; height: number } | null>(
    null,
  );

  const activeHref = navItems.reduce((best, item) => {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    return matches && item.href.length > best.length ? item.href : best;
  }, "");

  const litHref = pendingHref ?? activeHref;

  // A layout effect, not an effect: the pill is placed in the same frame the
  // row is, so it never paints at the wrong end of the list first. Measuring
  // needs no observer — every row is a fixed `h-11`, at both widths of the
  // rail, so nothing but the selection moves them.
  useLayoutEffect(() => {
    const row = list.current?.querySelector<HTMLElement>('[data-lit="true"]');
    setPill(row ? { top: row.offsetTop, height: row.offsetHeight } : null);
  }, [litHref]);

  return { activeHref, litHref, list, pill };
}
