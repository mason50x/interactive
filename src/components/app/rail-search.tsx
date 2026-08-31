"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { usePathname, useRouter } from "next/navigation";
import { useSearch } from "@/components/app/search-provider";
import { ACTIVITIES_HREF } from "@/lib/nav";

/**
 * Search, at the head of the rail.
 *
 * It sits above the destinations rather than among them because it is not one:
 * there is no search page to be on. Typing filters the activities grid in
 * place, and the only navigation it does is getting you to that grid if you
 * were somewhere else — once, on the first keystroke, so Back still returns to
 * where you were rather than unwinding a letter at a time.
 *
 * Collapsed, below `lg`, the field would be a 3rem box with room for two
 * characters, so it becomes the icon alone: a button that opens the grid,
 * where the page's width makes a real field possible again.
 */
export function RailSearch() {
  const { query, setQuery } = useSearch();
  const pathname = usePathname();
  const router = useRouter();

  const onActivities = pathname.startsWith(ACTIVITIES_HREF);

  function change(value: string) {
    setQuery(value);
    // Typing is the intent; the navigation is just what has to happen for the
    // results to be visible. Clearing the box is not — someone deleting a
    // query on the Home page did not ask to be moved.
    if (!onActivities && value.trim() !== "") router.push(ACTIVITIES_HREF);
  }

  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        aria-label="Search activities"
        onClick={() => router.push(ACTIVITIES_HREF)}
        className="flex h-11 w-full items-center justify-center rounded-lg text-muted-foreground backdrop-blur-[3px] transition-colors hover:bg-foreground/[0.05] hover:text-foreground lg:hidden"
      >
        <MagnifyingGlassIcon className="size-5" />
      </button>

      <search className="relative hidden lg:block">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={query}
          onChange={(event) => change(event.target.value)}
          placeholder="Search"
          aria-label="Search activities"
          className="h-9 w-full rounded-lg border border-border bg-surface pr-2.5 pl-8 text-[0.875rem] text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </search>
    </div>
  );
}
