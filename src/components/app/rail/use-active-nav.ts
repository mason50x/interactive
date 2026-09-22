"use client";

import type { NavItem } from "@/lib/nav";

/** Match the visible destinations, including role-specific navigation. */
export function useActiveNav(
  pathname: string,
  pendingHref: string | null,
  destinations: readonly Pick<NavItem, "href">[],
) {
  const activeHref = destinations.reduce((best, item) => {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    return matches && item.href.length > best.length ? item.href : best;
  }, "");

  const litHref = pendingHref ?? activeHref;

  return { activeHref, litHref };
}
