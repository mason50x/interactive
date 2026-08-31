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
 * strings. What a shelf needs on top of that is a human label, a line of copy,
 * a mark, and a colour, none of which upstream supplies and none of which a
 * build script could invent. So they live here, hand-written, keyed by the
 * same six strings.
 *
 * Solid icons, imported on their own rather than as an `IconPair`: a shelf
 * head has no unselected state to pair against. See `src/lib/icons.ts`.
 */
export type GenreMeta = {
  label: string;
  /**
   * One line under the shelf head. Describes the *genre*, not any activity in it —
   * the catalogue has no per-activity copy, and a shelf head is the one place a
   * sentence about a whole category is honest.
   */
  description: string;
  icon: Icon;
  /**
   * The shelf's accent, as a plain hex.
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
    description: "Timing, precision, and the gap in between.",
    icon: RocketLaunchIcon,
    hue: "#8b5cf6",
  },
  reaction: {
    label: "Reaction",
    description: "Short loops that reward speed and repetition.",
    icon: BoltIcon,
    hue: "#f0603c",
  },
  "problem-solving": {
    label: "Problem solving",
    description: "Activities that ask you to think rather than react.",
    icon: PuzzlePieceIcon,
    hue: "#f59e0b",
  },
  exploration: {
    label: "Exploration",
    description: "Worlds to wander, with something at the end of them.",
    icon: MapIcon,
    hue: "#2f9e6e",
  },
  systems: {
    label: "Systems",
    description: "Run a kitchen, a city, or a life.",
    icon: BuildingStorefrontIcon,
    hue: "#14b8a6",
  },
  touch: {
    label: "Touch",
    description: "Touch-first activities that grew up on a phone.",
    icon: DevicePhoneMobileIcon,
    hue: "#3c85f7",
  },
};
