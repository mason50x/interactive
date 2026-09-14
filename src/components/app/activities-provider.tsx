"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ActivityEntry } from "@/lib/activity";

/**
 * The catalogue, on the client side of the session.
 *
 * `src/lib/activities.ts` is `server-only`, so the entries reach a browser one
 * way: as a prop on this provider, serialised into the RSC payload of the
 * dashboard layout behind its `auth.protect()`. Everything under `/dashboard`
 * that draws activities — the rail's search, the home page's rows, the
 * activities grid — reads them from here rather than taking its own copy as a
 * page prop.
 *
 * That it is the layout and not the pages is the point. A page prop is
 * serialised again on every render of that page, and the home page and the
 * activities page each used to send all 288 entries alongside the layout's
 * own list for the rail — so a load of either carried the catalogue twice,
 * and a navigation between them carried it once more. Under the layout it
 * crosses once per full load and not at all on a client-side navigation,
 * which is fewer bytes for the browser and less CPU for the Worker that
 * serialises them.
 */
const ActivitiesContext = createContext<readonly ActivityEntry[] | null>(null);

export function ActivitiesProvider({
  children,
  activities,
}: {
  children: ReactNode;
  activities: readonly ActivityEntry[];
}) {
  return (
    <ActivitiesContext.Provider value={activities}>
      {children}
    </ActivitiesContext.Provider>
  );
}

export function useActivities(): readonly ActivityEntry[] {
  const activities = useContext(ActivitiesContext);
  if (activities === null) {
    throw new Error("useActivities must be used inside <ActivitiesProvider>");
  }
  return activities;
}
