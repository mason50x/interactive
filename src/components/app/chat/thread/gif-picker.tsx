"use client";

import {
  ArrowLeftIcon,
  ChevronRightIcon,
  HeartIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { MenuItem } from "@/components/ui/menu";
import { PickerSearch } from "@/components/app/chat/thread/picker-search";
import { useGifFavorites } from "@/components/app/chat/thread/use-gif-favorites";
import { fetchGifs, type GifResult } from "@/lib/klipy";
import { useFlip } from "@/lib/use-flip";
import { cn } from "@/lib/utils";
import type { ChatGif } from "@convex/chat/messages";

/** How long typing has to pause before a search is sent. */
const DEBOUNCE_MS = 300;
const COLUMNS = 2;
/** Loading tiles per column, as aspect ratios, staggered like real results. */
const SKELETON = [
  ["4 / 3", "1 / 1", "16 / 9"],
  ["1 / 1", "16 / 9", "4 / 3"],
];
/** How many saved GIFs the row under the search field shows before "+n". */
const ROW_THUMBS = 4;

type Feed = {
  /** The query these results belong to; blank is trending. */
  query: string;
  results: GifResult[];
  page: number;
  hasNext: boolean;
  status: "loading" | "idle" | "error";
};

type Page = "browse" | "saved";

/**
 * The GIF panel inside the plus menu: trending until something is typed,
 * then KLIPY's results for it, loading more as the grid scrolls.
 *
 * Laid out as two columns, each result dropped into whichever is shorter so
 * nothing is cropped and KLIPY's order still reads top-left first.
 *
 * Every tile carries a heart. Hearted GIFs collect in a row under the search
 * field, and that row opens a second page — the saved gallery — which the
 * panel slides over to. The two pages sit side by side on a track and stay
 * mounted, so coming back from the gallery lands exactly where the grid was
 * scrolled to. The page that is off-screen is inert and its items disabled,
 * which is what keeps the menu's arrow keys from walking into it.
 */
export default function GifPicker({
  onBack,
  onPick,
}: {
  onBack: () => void;
  onPick: (gif: ChatGif) => void;
}) {
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const [feed, setFeed] = useState<Feed>({
    query: "",
    results: [],
    page: 0,
    hasNext: true,
    status: "loading",
  });
  const [page, setPage] = useState<Page>("browse");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const favorites = useGifFavorites();

  useEffect(() => {
    const timer = window.setTimeout(
      () => setSettled(query.trim()),
      DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query]);

  // A new query starts over from its first page.
  const stale = feed.query !== settled;
  const wanted = stale ? 1 : feed.status === "loading" ? feed.page + 1 : null;

  useEffect(() => {
    if (wanted === null) return;
    const controller = new AbortController();
    const target = settled;
    if (wanted === 1 && scrollerRef.current) scrollerRef.current.scrollTop = 0;
    fetchGifs(target, wanted, controller.signal).then(
      (page) =>
        setFeed((previous) => ({
          query: target,
          results:
            wanted === 1 || previous.query !== target
              ? page.results
              : [...previous.results, ...page.results],
          page: wanted,
          hasNext: page.hasNext && page.results.length > 0,
          status: "idle",
        })),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setFeed((previous) => ({
          ...(previous.query === target
            ? previous
            : { query: target, results: [], page: 0, hasNext: true }),
          status: "error",
        }));
      },
    );
    return () => controller.abort();
  }, [settled, wanted]);

  function loadMore() {
    if (feed.status !== "idle" || !feed.hasNext || stale) return;
    setFeed((previous) => ({ ...previous, status: "loading" }));
  }

  const columns = useMemo(
    () => lanes(stale ? [] : feed.results),
    [feed.results, stale],
  );

  const empty = !stale && feed.status === "idle" && feed.results.length === 0;
  const busy = stale || feed.status === "loading";
  const saved = favorites.saved ?? [];
  const browsing = page === "browse";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="gif-pages flex min-h-0 w-[200%] flex-1" data-page={page}>
        <PickerPage active={browsing}>
          <div className="mb-2 flex items-center gap-1 pr-1.5">
            <MenuItem
              closeOnClick={false}
              disabled={!browsing}
              onClick={onBack}
              aria-label="Back"
              className="!size-8 !justify-center !gap-0 !rounded-full !p-0"
            >
              <ArrowLeftIcon className="size-4" />
            </MenuItem>
            <p className="flex-1 text-[0.9375rem] font-semibold">GIFs</p>
            <p className="text-xs text-faint">Powered by KLIPY</p>
          </div>
          <div className="mx-1 mb-2.5">
            {/* "Search KLIPY" is the placeholder KLIPY's attribution rules require. */}
            <PickerSearch
              value={query}
              onChange={setQuery}
              label="Search GIFs"
              placeholder="Search KLIPY"
            />
          </div>
          {saved.length > 0 ? (
            <SavedRow
              saved={saved}
              disabled={!browsing}
              onOpen={() => setPage("saved")}
            />
          ) : null}
          <div
            ref={scrollerRef}
            className="min-h-0 flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-1 pb-1"
            aria-label={settled ? "GIF search results" : "Trending GIFs"}
            aria-busy={busy}
            onScroll={(event) => {
              const scroller = event.currentTarget;
              if (
                scroller.scrollHeight -
                  scroller.scrollTop -
                  scroller.clientHeight <
                320
              )
                loadMore();
            }}
          >
            {empty ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No GIFs found
              </p>
            ) : (
              <div className="flex items-start gap-1.5">
                {columns.map((items, index) => (
                  <div
                    key={index}
                    className="flex min-w-0 flex-1 flex-col gap-1.5"
                  >
                    {items.map((result) => (
                      <GifTile
                        key={result.slug}
                        result={result}
                        saved={favorites.isSaved(result.slug)}
                        disabled={!browsing}
                        onPick={onPick}
                        onToggle={favorites.toggle}
                      />
                    ))}
                    {/* Placeholder tiles while a page is on its way. */}
                    {busy && feed.status !== "error"
                      ? SKELETON[index].map((ratio, key) => (
                          <div
                            key={key}
                            aria-hidden
                            className="animate-pulse rounded-2xl bg-foreground/[0.06]"
                            style={{ aspectRatio: ratio }}
                          />
                        ))
                      : null}
                  </div>
                ))}
              </div>
            )}
            {feed.status === "error" && !stale ? (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                <p>GIFs couldn’t load.</p>
                <Button
                  size="sm"
                  variant="secondary"
                  shape="circle"
                  // Back to loading asks for the page that failed, since `page`
                  // only advances on success.
                  onClick={() =>
                    setFeed((previous) => ({ ...previous, status: "loading" }))
                  }
                >
                  Try again
                </Button>
              </div>
            ) : null}
          </div>
        </PickerPage>

        <PickerPage active={!browsing}>
          <SavedGallery
            saved={saved}
            active={!browsing}
            onBack={() => setPage("browse")}
            onPick={onPick}
            onToggle={favorites.toggle}
          />
        </PickerPage>
      </div>
      {favorites.notice ? (
        <p
          role="status"
          className="mx-1 mt-1.5 rounded-xl bg-foreground/[0.05] px-3 py-2 text-xs text-muted-foreground"
        >
          {favorites.notice}
        </p>
      ) : null}
    </div>
  );
}

/** Results dealt into `COLUMNS` lanes, each into whichever is shortest. */
function lanes(results: GifResult[]): GifResult[][] {
  const lanes = Array.from({ length: COLUMNS }, () => ({
    height: 0,
    items: [] as GifResult[],
  }));
  for (const result of results) {
    const lane = lanes.reduce((short, next) =>
      next.height < short.height ? next : short,
    );
    lane.items.push(result);
    lane.height += result.preview.height / result.preview.width;
  }
  return lanes.map((lane) => lane.items);
}

/**
 * One of the two pages on the track. The one that is off-screen is hidden
 * from everything — the tab order, assistive tech, pointer events — and its
 * `visibility` only flips once the slide has finished, so it does not vanish
 * mid-swipe. Coming back it is visible at once, which is what the missing
 * delay on the active side means.
 */
function PickerPage({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      inert={!active}
      aria-hidden={!active}
      className={cn(
        "flex h-full w-1/2 min-w-0 shrink-0 flex-col",
        active ? "visible" : "invisible transition-[visibility] delay-300",
      )}
    >
      {children}
    </div>
  );
}

/**
 * One result in the grid. The tile is the menu item — pressing it sends —
 * and the heart in its corner is a button of its own that stops every event
 * the item listens for, so hearting a GIF neither sends it nor closes the
 * menu. The heart is only drawn on hover or highlight until it is filled;
 * on a touchscreen there is no hover, so it is always there.
 */
function GifTile({
  result,
  saved,
  disabled,
  onPick,
  onToggle,
}: {
  result: GifResult;
  saved: boolean;
  disabled: boolean;
  onPick: (gif: ChatGif) => void;
  onToggle: (result: GifResult) => void;
}) {
  return (
    <MenuItem
      data-flip={result.slug}
      aria-label={result.title || "GIF"}
      title={result.title || undefined}
      disabled={disabled}
      className="group/gif relative !block overflow-hidden !rounded-2xl bg-foreground/[0.05] !p-0 transition-transform duration-200 ease-out active:scale-[0.97] motion-reduce:transition-none"
      style={{
        aspectRatio: `${result.preview.width} / ${result.preview.height}`,
      }}
      onClick={() => onPick(result.gif)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- KLIPY media must load from KLIPY; see src/lib/klipy.ts */}
      <img
        src={result.preview.url}
        width={result.preview.width}
        height={result.preview.height}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-cover transition duration-200 ease-out group-data-highlighted/gif:scale-[1.04] group-data-highlighted/gif:brightness-90 motion-reduce:transition-none"
      />
      <HeartButton saved={saved} onToggle={() => onToggle(result)} />
    </MenuItem>
  );
}

function stop(event: MouseEvent | PointerEvent) {
  event.stopPropagation();
}

function HeartButton({
  saved,
  onToggle,
}: {
  saved: boolean;
  onToggle: () => void;
}) {
  // Only a heart filled by a tap pops; one drawn already full sits still.
  const [pop, setPop] = useState(false);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={saved ? "Remove from saved GIFs" : "Save GIF"}
      aria-pressed={saved}
      onPointerDown={stop}
      onMouseDown={stop}
      onMouseUp={stop}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!saved) setPop(true);
        onToggle();
      }}
      className={cn(
        "absolute top-1.5 right-1.5 grid size-7 cursor-pointer place-items-center rounded-full bg-black/40 text-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] backdrop-blur-sm transition-[opacity,background-color,scale] duration-200 ease-out hover:bg-black/55 active:scale-90 motion-reduce:transition-none",
        saved
          ? "opacity-100"
          : "opacity-0 group-hover/gif:opacity-100 group-data-highlighted/gif:opacity-100 pointer-coarse:opacity-100",
      )}
    >
      {saved ? (
        <HeartSolidIcon
          className={cn("size-4 text-rose-400", pop && "gif-heart-pop")}
          onAnimationEnd={() => setPop(false)}
        />
      ) : (
        <HeartIcon className="size-4" strokeWidth={2} />
      )}
    </button>
  );
}

/**
 * The row under the search field: a filled heart, the count, the newest few
 * as thumbnails, and a chevron. One item, one action — it opens the gallery.
 */
function SavedRow({
  saved,
  disabled,
  onOpen,
}: {
  saved: GifResult[];
  disabled: boolean;
  onOpen: () => void;
}) {
  const shown = saved.slice(0, ROW_THUMBS);
  const more = saved.length - shown.length;
  return (
    <MenuItem
      closeOnClick={false}
      disabled={disabled}
      onClick={onOpen}
      aria-label={`Saved GIFs, ${saved.length}`}
      className="mx-1 mb-2.5 !h-11 shrink-0 !gap-2 !rounded-2xl bg-foreground/[0.04] !px-3 data-highlighted:bg-foreground/[0.08]"
    >
      <HeartSolidIcon className="size-4 shrink-0 text-rose-500" />
      <span className="font-medium">Saved</span>
      <span className="text-xs text-faint tabular-nums">{saved.length}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {shown.map((item) => (
          // eslint-disable-next-line @next/next/no-img-element -- KLIPY media must load from KLIPY; see src/lib/klipy.ts
          <img
            key={item.slug}
            src={item.preview.url}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-7 rounded-lg bg-foreground/[0.06] object-cover"
          />
        ))}
        {more > 0 ? (
          <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-foreground/[0.08] px-1 text-[0.6875rem] font-medium text-muted-foreground tabular-nums">
            +{more}
          </span>
        ) : null}
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-faint" />
    </MenuItem>
  );
}

/**
 * The saved gallery: the same two-column grid, drawn from the account's
 * hearts. Un-hearting a GIF here lifts it out and the rest glide into the
 * gap, courtesy of `useFlip`, rather than the grid snapping to a new shape.
 */
function SavedGallery({
  saved,
  active,
  onBack,
  onPick,
  onToggle,
}: {
  saved: GifResult[];
  active: boolean;
  onBack: () => void;
  onPick: (gif: ChatGif) => void;
  onToggle: (result: GifResult) => void;
}) {
  const columns = useMemo(() => lanes(saved), [saved]);
  const { frame, ghosts } = useFlip(saved);
  return (
    <>
      <div className="mb-2.5 flex items-center gap-1 pr-1.5">
        <MenuItem
          closeOnClick={false}
          disabled={!active}
          onClick={onBack}
          aria-label="Back to all GIFs"
          className="!size-8 !justify-center !gap-0 !rounded-full !p-0"
        >
          <ArrowLeftIcon className="size-4" />
        </MenuItem>
        <p className="flex-1 text-[0.9375rem] font-semibold">Saved</p>
        <p className="text-xs text-faint tabular-nums">
          {saved.length === 1 ? "1 GIF" : `${saved.length} GIFs`}
        </p>
      </div>
      <div
        className="min-h-0 flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-1 pb-1"
        aria-label="Saved GIFs"
      >
        {saved.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
            <span className="mb-1 grid size-11 place-items-center rounded-full bg-foreground/[0.05]">
              <HeartIcon className="size-5 text-faint" strokeWidth={1.75} />
            </span>
            <p className="text-sm font-medium">Nothing saved yet</p>
            <p className="text-xs text-muted-foreground">
              Tap the heart on a GIF to keep it here.
            </p>
          </div>
        ) : (
          <div ref={frame} className="relative">
            <div className="flex items-start gap-1.5">
              {columns.map((items, index) => (
                <div
                  key={index}
                  className="flex min-w-0 flex-1 flex-col gap-1.5"
                >
                  {items.map((result) => (
                    <GifTile
                      key={result.slug}
                      result={result}
                      saved
                      disabled={!active}
                      onPick={onPick}
                      onToggle={onToggle}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div
              ref={ghosts}
              inert
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
            />
          </div>
        )}
      </div>
    </>
  );
}
