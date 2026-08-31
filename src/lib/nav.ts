import {
  ChatBubbleLeftRightIcon,
  HomeModernIcon,
  PuzzlePieceIcon,
} from "@heroicons/react/24/outline";
import {
  ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
  HomeModernIcon as HomeModernIconSolid,
  PuzzlePieceIcon as PuzzlePieceIconSolid,
} from "@heroicons/react/24/solid";
import type { IconPair } from "@/lib/icons";

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

/**
 * The catalogue, and the one page that reads the rail's search query as a
 * filter rather than as a lookup. See `SearchProvider`.
 */
export const ACTIVITIES_HREF = "/dashboard/activities";

export const CHAT_HREF = "/dashboard/chat";

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
    icon: { outline: HomeModernIcon, solid: HomeModernIconSolid },
  },
  {
    label: "Activities",
    href: ACTIVITIES_HREF,
    icon: { outline: PuzzlePieceIcon, solid: PuzzlePieceIconSolid },
  },
  {
    label: "Chat",
    href: CHAT_HREF,
    icon: {
      outline: ChatBubbleLeftRightIcon,
      solid: ChatBubbleLeftRightIconSolid,
    },
    unread: true,
  },
];

/**
 * The same destinations as a bare list of paths, held once.
 *
 * `useWarmRoutes` takes this as an effect dependency, so it has to keep its
 * identity between renders — `navItems.map(...)` in a component body is a new
 * array every time and would restart the idle pass on each one. Derived from
 * `navItems` rather than written out again so a new row cannot be warmed by
 * one list and shown by the other.
 */
export const NAV_HREFS: readonly string[] = navItems.map((item) => item.href);
