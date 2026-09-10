"use client";

import { createContext, use } from "react";
import type { RailState } from "@/lib/rail";

export type RailContextValue = {
  /** The width the rail has been asked for. Below `lg` it is icons regardless. */
  rail: RailState;
  /** Put the rail at `state`, and remember it. See `src/lib/rail.ts`. */
  setRail: (state: RailState) => void;
};

/**
 * The rail's width, for the few things inside it that have to *know* it
 * rather than merely look the part.
 *
 * Nearly everything in the rail follows the width through CSS alone — the
 * `wide:` and `narrow:` variants read `data-rail` off the `<nav>` — and should
 * keep doing so. This is for the exceptions: the account popup is portalled
 * out of the nav and cannot see the attribute, and the search box answers a
 * shortcut that has to be able to open a collapsed rail before there is
 * anything to focus. `AppSidebar` provides it.
 */
export const RailContext = createContext<RailContextValue>({
  rail: "open",
  setRail: () => {},
});

export function useRail() {
  return use(RailContext);
}
