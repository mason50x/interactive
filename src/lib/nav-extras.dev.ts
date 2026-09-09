import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { GlobeIconSolid } from "@/components/app/nav-icons";
import type { NavItem } from "@/lib/nav";

/**
 * The development-only rail entries. Resolved in place of `nav-extras.ts`
 * under `next dev` only — see that file and `resolveExtensions` in
 * next.config.ts. The routes these point at are `page.dev.tsx` files, which
 * exist under the same rule, so a build that cannot see this file cannot see
 * them either.
 */
export const extraNavItems: NavItem[] = [
  {
    label: "Experience",
    href: "/dashboard/experience",
    icon: { outline: GlobeAltIcon, solid: GlobeIconSolid },
  },
];
