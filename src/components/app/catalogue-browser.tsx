"use client";
import {
  useDeferredValue,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CategoryMenu } from "@/components/app/activities/category-menu";
import { LineSearch } from "@/components/ui/line-search";
import { SegmentedControl } from "@/components/ui/segmented";
import { GENRES } from "@/lib/genres";
import { cn } from "@/lib/utils";
type Sort = "popular" | "title";
const FIRST_PAINT = 30;
const subscribeToNothing = () => () => {};
const SORTS: readonly { value: Sort; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "title", label: "A–Z" },
];

/** Shared search, category, sorting, and grid layout for both catalogues. */
export function CatalogueBrowser<
  T extends { slug: string; title: string; genre: string },
>({
  catalogue,
  ranked,
  renderGrid,
  noun = "activities",
  categories = GENRES,
  defaultSortLabel = "Popular",
}: {
  catalogue: readonly T[];
  ranked: readonly T[];
  renderGrid: (shown: readonly T[]) => ReactNode;
  noun?: string;
  categories?: Record<string, { label: string; hue: string }>;
  defaultSortLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("popular");
  const deferred = useDeferredValue(query);
  const needle = deferred.trim();
  const searching = needle.length > 0;

  // Which categories the catalogue actually has, best-ranked first. Read off
  // the array rather than off `GENRES`, because the catalogue is rank-ascending
  // and so first appearance is the same order the shelves used to be in — the
  // genre whose best activity ranks highest leads the menu.
  const genres = useMemo(() => {
    const order: string[] = [];
    for (const activity of catalogue) {
      if (!order.includes(activity.genre)) order.push(activity.genre);
    }
    return order;
  }, [catalogue]);

  const shown = useMemo(() => {
    const inGenre =
      genre === "all"
        ? ranked
        : ranked.filter((activity) => activity.genre === genre);

    const matched = searching
      ? inGenre.filter((item) =>
          `${item.title} ${item.slug} ${item.genre}`
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .includes(needle.toLowerCase().replace(/[^a-z0-9]/g, "")),
        )
      : inGenre;

    // Weekly views lead; lifetime views break ties.
    return sort === "title"
      ? [...matched].sort((a, b) => a.title.localeCompare(b.title))
      : matched;
  }, [ranked, genre, needle, searching, sort]);

  const filtered = searching || genre !== "all";

  /**
   * `false` on the server and while hydrating, `true` from the first render
   * after. React uses the server snapshot to hydrate and then re-renders with
   * the client one if it differs, so this is hydrate-then-fill in one
   * primitive: the markup the server sent and the markup the browser expects
   * agree, and the remaining cards mount immediately afterwards, well below
   * the fold, where `useFlip` leaves off-screen arrivals alone.
   */
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const painted = hydrated ? shown : shown.slice(0, FIRST_PAINT);

  return (
    <div className="flex flex-col gap-6">
      <div
        className={cn(
          "sticky top-0 z-20 flex flex-wrap items-center gap-3 py-3",
          "-mx-6 px-6 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10",
          "bg-surface/85 backdrop-blur-md",
        )}
      >
        <search className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          <LineSearch
            value={query}
            onChange={setQuery}
            label={`Search ${noun}`}
            placeholder={`Search ${catalogue.length} ${noun} by name`}
          />
        </search>

        <CategoryMenu
          genres={genres}
          genre={genre}
          onChange={setGenre}
          catalogue={catalogue}
          categories={categories}
        />

        <SegmentedControl
          tone="neutral"
          aria-label={`Sort ${noun}`}
          value={sort}
          onValueChange={setSort}
          options={[{ value: "popular", label: defaultSortLabel }, SORTS[1]]}
        />
      </div>

      {shown.length === 0 ? (
        <p className="-mb-2 text-sm text-muted-foreground" role="status">
          Nothing matches “{needle}”
          {genre !== "all" ? ` in ${categories[genre].label}` : ""}.
        </p>
      ) : (
        filtered && (
          <p className="-mb-2 text-xs text-faint">
            {shown.length} of {catalogue.length}
            {searching ? ` match “${needle}”` : ""}
            {genre !== "all" ? ` in ${categories[genre].label}` : ""}
          </p>
        )
      )}

      {renderGrid(painted)}
    </div>
  );
}
