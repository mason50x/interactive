"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Search = { query: string; setQuery: (query: string) => void };

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
export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const value = useMemo(() => ({ query, setQuery }), [query]);

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
