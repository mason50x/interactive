"use client";

import { useCallback, useMemo, useState } from "react";
import type { RailContextValue } from "@/components/app/rail-context";
import { type RailState, rememberRailState } from "@/lib/rail";

/**
 * The width the rail has been asked for, and the memory of it.
 *
 * Seeded from the cookie the layout read, so the first frame is the
 * remembered one, and written back on every change. Below `lg` the rail is
 * icons whatever this says; see the `wide:` variant.
 *
 * `moved` is whether it has ever been toggled in this document. The swapped
 * elements do not animate until it has — see `rail-wide` in `globals.css` for
 * why a rail that has not moved must not fade anything in.
 *
 * `railContext` is the value `AppSidebar` provides through `RailContext`,
 * memoised here so the few consumers that have to *know* the width rather
 * than look the part do not re-render on every render of the rail.
 */
export function useRailState(initialRail: RailState) {
  const [rail, setRail] = useState<RailState>(initialRail);
  const [moved, setMoved] = useState(false);

  const changeRail = useCallback((state: RailState) => {
    setRail(state);
    setMoved(true);
    rememberRailState(state);
  }, []);

  const railContext = useMemo<RailContextValue>(
    () => ({ rail, setRail: changeRail }),
    [rail, changeRail],
  );

  return { rail, moved, railContext };
}
