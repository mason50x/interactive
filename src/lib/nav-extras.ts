import type { NavItem } from "@/lib/nav";

/**
 * Rail entries that only exist on a developer's machine.
 *
 * This file is the production answer: none. Under `next dev` the import in
 * `src/lib/nav.ts` resolves to the `.dev.ts` sibling instead, because the
 * config lists `.dev.ts` ahead of `.ts` in the extensions Turbopack tries
 * (see `resolveExtensions` in next.config.ts). A production build never opens
 * that sibling, so nothing it names reaches a bundle or a source map.
 */
export const extraNavItems: NavItem[] = [];
