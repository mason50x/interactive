"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Genre } from "@/lib/activity";

/**
 * One activity, reduced to the three fields a search needs.
 *
 * Not the `Activity` type, deliberately. That carries a thumbnail path, a byte
 * count and a rank, none of which a result row draws, and this list is handed
 * to the browser on every page of the dashboard rather than only on the
 * catalogue — so it is worth being the smallest thing that can answer "what is
 * this called and where does it live".
 */
export type ActivityEntry = { slug: string; title: string; genre: Genre };

type Search = {
  query: string;
  setQuery: (query: string) => void;
  /**
   * The catalogue, as the rail's search sees it.
   *
   * It arrives here as a prop from the dashboard layout and never as an
   * import: `src/lib/activities.ts` is `server-only`, and a `"use client"`
   * module reaching for it would put the whole index in a `/_next/static`
   * chunk that is served with no session in front of it. As a prop it travels
   * in the layout's RSC payload, behind the `auth.protect()` that layout
   * already runs. See that file's header for the hole this closes.
   */
  activities: readonly ActivityEntry[];
};

const SearchContext = createContext<Search | null>(null);

/**
 * The rail's search box and the grid it filters, joined by state instead of by
 * a URL.
 *
 * The obvious wiring — push `?q=` on every keystroke — would put a server
 * round trip behind each letter, because the activities page is a Server
 * Component and its search params are server input. There is nothing to fetch:
 * that page already handed the browser the whole catalogue as a prop (see
 * `ActivitiesBrowser`), so the filtering is local and the only thing that has
 * to travel is a string between two components in the same tree.
 *
 * It lives on the dashboard layout, which is the nearest thing that contains
 * both the rail and the page beside it. The query deliberately does not
 * survive a reload: a search box that comes back full of yesterday's word is a
 * page that looks broken until you find the box.
 */
export function SearchProvider({
  children,
  activities,
}: {
  children: ReactNode;
  activities: readonly ActivityEntry[];
}) {
  const [query, setQuery] = useState("");
  const value = useMemo(
    () => ({ query, setQuery, activities }),
    [query, activities],
  );

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export function useSearch(): Search {
  const search = useContext(SearchContext);
  if (search === null) {
    throw new Error("useSearch must be used inside <SearchProvider>");
  }
  return search;
}
