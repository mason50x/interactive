"use client";

import { navItems } from "@/lib/nav";

/** Match the most specific route; pending navigation highlights immediately. */
export function useActiveNav(pathname: string, pendingHref: string | null) {
  const activeHref = navItems.reduce((best, item) => {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    return matches && item.href.length > best.length ? item.href : best;
  }, "");

  const litHref = pendingHref ?? activeHref;

  return { activeHref, litHref };
}
