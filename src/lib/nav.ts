import {
  FilmIcon,
  CpuChipIcon,
  ChatBubbleLeftRightIcon,
  GlobeAltIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { FilmIcon as FilmIconSolid, TrophyIcon as TrophyIconSolid } from "@heroicons/react/24/solid";
import type { IconPair } from "@/lib/icons";
import { ControllerIcon } from "@/components/app/controller-icon";
import {
  ChatIconSolid,
  ChipIconSolid,
  ControllerIconSolid,
  GlobeIconSolid,
} from "@/components/app/nav-icons";

export type NavItem = {
  label: string;
  href: string;
  icon: IconPair;
  /**
   * Whether this row shows an unread dot.
   *
   * A flag rather than a number, because the number is not the rail's to know:
   * `AppSidebar` reads it from `useChat()` and the rail stays a list of
   * destinations. Only one row has ever wanted it, and a second would be one
   * more line here rather than a different shape.
   */
  unread?: boolean;
};

/** The catalogue. Has a search box of its own, separate from the rail's. */
export const ACTIVITIES_HREF = "/activities";

const SIMULATOR_HREF = "/learning-simulator";

export const CHAT_HREF = "/chat";

/**
 * Every destination inside the signed-in app, in the order the rail shows
 * them. New dashboard routes are added here and nowhere else.
 *
 * Each carries both cuts of its icon: the page you are on gets the solid one.
 * The solids are the rail's own animated set (see `nav-icons.tsx`); the
 * outlines are Heroicons' where it has the glyph.
 */
export const navItems: NavItem[] = [
  {
    label: "Activities",
    href: ACTIVITIES_HREF,
    icon: { outline: ControllerIcon, solid: ControllerIconSolid },
  },
  {
    label: "Entertainment",
    href: "/entertainment",
    icon: { outline: FilmIcon, solid: FilmIconSolid },
  },
  {
    label: "Chat",
    href: CHAT_HREF,
    icon: {
      outline: ChatBubbleLeftRightIcon,
      solid: ChatIconSolid,
    },
    unread: true,
  },
  {
    label: "Leaderboard",
    href: "/leaderboard",
    icon: { outline: TrophyIcon, solid: TrophyIconSolid },
  },
  {
    label: "Experience",
    href: "/experience",
    icon: { outline: GlobeAltIcon, solid: GlobeIconSolid },
  },
  {
    label: "Simulators",
    href: SIMULATOR_HREF,
    icon: { outline: CpuChipIcon, solid: ChipIconSolid },
  },
];
