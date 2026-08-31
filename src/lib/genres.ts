import {
  BoltIcon,
  BuildingStorefrontIcon,
  DevicePhoneMobileIcon,
  MapIcon,
  PuzzlePieceIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/solid";
import type { Genre } from "@/lib/activity";
import type { Icon } from "@/lib/icons";

/**
 * The presentation half of a genre — everything the catalogue does not carry.
 *
 * `activity.ts` carries the `Genre` type and knows a genre only as one of six
 * strings. What a card, a filter menu and the rail's search results need on
 * top of that is a human label, a mark, and a colour, none of which upstream
 * supplies and none of which a build script could invent. So they live here,
 * hand-written, keyed by the same six strings.
 *
 * Solid icons, imported on their own rather than as an `IconPair`: none of the
 * places a genre appears has an unselected state to pair against. See
 * `src/lib/icons.ts`.
 */
export type GenreMeta = {
  label: string;
  icon: Icon;
  /**
   * The genre's accent, as a plain hex.
   *
   * Not a palette token because there are six of these and the palette has one
   * brand colour. Consumers mix it into the surface with `color-mix` rather
   * than painting it flat, which is what keeps a fixed hex readable in both
   * themes: at ~14% over the background it tints, and the icon itself is the
   * only place the full-strength colour lands.
   */
  hue: string;
};

export const GENRES: Record<Genre, GenreMeta> = {
  coordination: {
    label: "Coordination",
    icon: RocketLaunchIcon,
    hue: "#8b5cf6",
  },
  reaction: {
    label: "Reaction",
    icon: BoltIcon,
    hue: "#f0603c",
  },
  "problem-solving": {
    label: "Problem solving",
    icon: PuzzlePieceIcon,
    hue: "#f59e0b",
  },
  exploration: {
    label: "Exploration",
    icon: MapIcon,
    hue: "#2f9e6e",
  },
  systems: {
    label: "Systems",
    icon: BuildingStorefrontIcon,
    hue: "#14b8a6",
  },
  touch: {
    label: "Touch",
    icon: DevicePhoneMobileIcon,
    hue: "#3c85f7",
  },
};
