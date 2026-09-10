import {
  CpuChipIcon,
  ChatBubbleLeftRightIcon,
  HomeModernIcon,
} from "@heroicons/react/24/outline";
import type { IconPair } from "@/lib/icons";
import { BrainIcon } from "@/components/app/brain-icon";
import { ControllerIcon } from "@/components/app/controller-icon";
import {
  BrainIconSolid,
  ChatIconSolid,
  ChipIconSolid,
  ControllerIconSolid,
  HomeIconSolid,
} from "@/components/app/nav-icons";
import { extraNavItems } from "@/lib/nav-extras";

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
export const ACTIVITIES_HREF = "/dashboard/activities";

const SIMULATOR_HREF = "/dashboard/learning-simulator";

export const CHAT_HREF = "/dashboard/chat";

export const PHILOSOPHY_HREF = "/dashboard/our-philosophy";

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
    href: "/dashboard",
    icon: { outline: HomeModernIcon, solid: HomeIconSolid },
  },
  {
    label: "Activities",
    href: ACTIVITIES_HREF,
    icon: { outline: ControllerIcon, solid: ControllerIconSolid },
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
  // Rows that exist only on a developer's machine; an empty list in every
  // build. See `src/lib/nav-extras.ts` for how the swap works.
  ...extraNavItems,
  {
    label: "Simulators",
    href: SIMULATOR_HREF,
    icon: { outline: CpuChipIcon, solid: ChipIconSolid },
  },
  {
    label: "Philosophy",
    href: PHILOSOPHY_HREF,
    icon: { outline: BrainIcon, solid: BrainIconSolid },
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
