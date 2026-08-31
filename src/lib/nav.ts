import { HomeIcon, PuzzlePieceIcon } from "@heroicons/react/24/outline";
import {
  HomeIcon as HomeIconSolid,
  PuzzlePieceIcon as PuzzlePieceIconSolid,
} from "@heroicons/react/24/solid";
import type { IconPair } from "@/lib/icons";

export type NavItem = { label: string; href: string; icon: IconPair };

/** Where the rail's search sends you, and the only page that reads its query. */
export const ACTIVITIES_HREF = "/dashboard/activities";

/**
 * Every destination inside the signed-in app, in the order the rail shows
 * them. New dashboard routes are added here and nowhere else.
 *
 * Each carries both cuts of its icon: the page you are on gets the solid one.
 */
export const navItems: NavItem[] = [
  {
    label: "Home",
    href: "/dashboard",
    icon: { outline: HomeIcon, solid: HomeIconSolid },
  },
  {
    label: "Activities",
    href: ACTIVITIES_HREF,
    icon: { outline: PuzzlePieceIcon, solid: PuzzlePieceIconSolid },
  },
];
