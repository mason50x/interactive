import { HandThumbUpIcon } from "@heroicons/react/24/outline";
import { VoteIconSolid } from "@/components/app/nav-icons";
import { VotingBadge } from "@/components/app/voting/voting-badge";
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
    label: "Voting",
    href: "/dashboard/voting",
    icon: { outline: HandThumbUpIcon, solid: VoteIconSolid },
    badge: VotingBadge,
  },
];
