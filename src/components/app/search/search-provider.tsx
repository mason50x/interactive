"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ActivityEntry } from "@/lib/activity";

// Re-exported for the components that already take it from here; the type
// itself lives beside `Activity` so the server module that produces the list
// does not have to import a component to name its return type.
export type { ActivityEntry };

type Search = {
  /**
   * The catalogue, as the rail's search sees it.
   *
   * It arrives here as a prop from the dashboard layout and never as an
   * import: `src/lib/server/activities.ts` is `server-only`, and a `"use client"`
   * module reaching for it would put the whole index in a `/_next/static`
   * chunk that is served with no session in front of it. As a prop it travels
   * in the layout's RSC payload, behind the `auth.protect()` that layout
   * already runs. See that file's header for the hole this closes.
   */
  activities: readonly ActivityEntry[];
};

const SearchContext = createContext<Search | null>(null);

/**
 * The catalogue, carried to the rail's search box.
 *
 * That is all it carries. It used to hold the query as well, shared between
 * the rail and the activities grid so that typing in one filtered the other —
 * which meant typing on the catalogue page filled the rail's box with the same
 * word and bloomed it open across the shell. The two boxes answer different
 * questions (one finds anything, the other narrows a grid) and each now keeps
 * its own string; what they still share is the list, for the reason above.
 *
 * It lives on the dashboard layout because the rail is rendered there, on
 * every page, and the list has to be in the tree wherever the box is.
 */
export function SearchProvider({
  children,
  activities,
}: {
  children: ReactNode;
  activities: readonly ActivityEntry[];
}) {
  return (
    <SearchContext.Provider value={{ activities }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch(): Search {
  const search = useContext(SearchContext);
  if (search === null) {
    throw new Error("useSearch must be used inside <SearchProvider>");
  }
  return search;
}
