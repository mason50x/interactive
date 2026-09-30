import {
  FilmIcon,
  CpuChipIcon,
  ChatBubbleLeftRightIcon,
  GlobeAltIcon,
  HomeIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import {
  FilmIcon as FilmIconSolid,
  TrophyIcon as TrophyIconSolid,
} from "@heroicons/react/24/solid";
import type { IconPair } from "@/lib/icons";
import { ControllerIcon } from "@/components/app/controller-icon";
import {
  ChatIconSolid,
  ChipIconSolid,
  ControllerIconSolid,
  GlobeIconSolid,
  HomeIconSolid,
} from "@/components/app/nav-icons";

export type NavItem = {
  label: string;
  href: string;
  icon: IconPair;
  /**
   * Whether this row shows an unread dot.
   *
   * A flag rather than a number, because the number is not the rail's to know:
   * `AppHeader` reads it from `useChat()` and the rail stays a list of
   * destinations. Only one row has ever wanted it, and a second would be one
   * more line here rather than a different shape.
   */
  unread?: boolean;
  /** Which heading the rail files it under. Home has none: it sits above them. */
  group?: NavGroup;
};

/**
 * The rail's headings, in the order it shows them. A destination's place
 * within its group still follows the account's own arrangement.
 */
export const navGroups = [
  { id: "entertainment", label: "Entertainment" },
  { id: "utilities", label: "Utilities" },
  { id: "community", label: "Community" },
] as const;

export type NavGroup = (typeof navGroups)[number]["id"];

/** The activities catalogue, with its own search box. */
export const ACTIVITIES_HREF = "/activities";

const SIMULATOR_HREF = "/emulate";

export const CHAT_HREF = "/chat";

/** Where a signed-in session lands: the logo, sign-in and `/` all go here. */
export const HOME_HREF = "/home";

export const LEADERBOARD_HREF = "/leaderboard";

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
    label: "Home",
    href: HOME_HREF,
    icon: { outline: HomeIcon, solid: HomeIconSolid },
  },
  {
    label: "Activities",
    group: "entertainment",
    href: ACTIVITIES_HREF,
    icon: { outline: ControllerIcon, solid: ControllerIconSolid },
  },
  {
    label: "TV",
    group: "entertainment",
    href: "/tv",
    icon: { outline: FilmIcon, solid: FilmIconSolid },
  },
  {
    label: "Chat",
    group: "community",
    href: CHAT_HREF,
    icon: {
      outline: ChatBubbleLeftRightIcon,
      solid: ChatIconSolid,
    },
    unread: true,
  },
  {
    label: "Browse",
    group: "utilities",
    href: "/browse",
    icon: { outline: GlobeAltIcon, solid: GlobeIconSolid },
  },
  {
    label: "Emulate",
    group: "utilities",
    href: SIMULATOR_HREF,
    icon: { outline: CpuChipIcon, solid: ChipIconSolid },
  },
  {
    label: "Leaderboard",
    group: "community",
    href: LEADERBOARD_HREF,
    icon: { outline: TrophyIcon, solid: TrophyIconSolid },
  },
];

export const SETTINGS_HREF = "/settings";

/**
 * The first tab, which is where `/settings` on its own redirects. Links go
 * straight here instead: pointing them at the bare route would cost every
 * click a round trip to the server just to be told where to go next.
 */
export const SETTINGS_DEFAULT_SECTION = "appearance";
export const SETTINGS_DEFAULT_HREF = `${SETTINGS_HREF}/${SETTINGS_DEFAULT_SECTION}`;

/**
 * The rail as the account arranged it: `order` first, in its order, then
 * anything it does not mention in the default order — so a destination added
 * after someone rearranged still shows up — less whatever they hid. Home is
 * never hidden: it is where the logo goes, and a rail without it has no floor.
 */
export function arrangeNav(
  items: NavItem[],
  order: readonly string[],
  hidden: readonly string[],
): NavItem[] {
  const rank = (href: string) => {
    const index = order.indexOf(href);
    return index === -1
      ? order.length + items.findIndex((item) => item.href === href)
      : index;
  };
  return [...items]
    .sort((a, b) => rank(a.href) - rank(b.href))
    .filter((item) => item.href === HOME_HREF || !hidden.includes(item.href));
}

/**
 * The arranged rail cut into its sections: the ungrouped destinations first
 * with no heading, then each of `navGroups` that still has something in it.
 */
export function groupNav(
  items: NavItem[],
): { id: NavGroup | null; label: string | null; items: NavItem[] }[] {
  const sections = [
    { id: null, label: null, items: items.filter((item) => !item.group) },
    ...navGroups.map((group) => ({
      id: group.id,
      label: group.label,
      items: items.filter((item) => item.group === group.id),
    })),
  ];
  return sections.filter((section) => section.items.length > 0);
}
