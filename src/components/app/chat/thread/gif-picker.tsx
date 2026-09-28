"use client";

import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MenuItem } from "@/components/ui/menu";
import { PickerSearch } from "@/components/app/chat/thread/picker-search";
import { fetchGifs, type GifResult } from "@/lib/klipy";
import type { ChatGif } from "@convex/chat/messages";

/** How long typing has to pause before a search is sent. */
const DEBOUNCE_MS = 300;
const COLUMNS = 2;
/** Loading tiles per column, as aspect ratios, staggered like real results. */
const SKELETON = [
  ["4 / 3", "1 / 1", "16 / 9"],
  ["1 / 1", "16 / 9", "4 / 3"],
];

type Feed = {
  /** The query these results belong to; blank is trending. */
  query: string;
  results: GifResult[];
  page: number;
  hasNext: boolean;
  status: "loading" | "idle" | "error";
};

/**
 * The GIF panel inside the plus menu: trending until something is typed,
 * then KLIPY's results for it, loading more as the grid scrolls.
 *
 * Laid out as two columns, each result dropped into whichever is shorter so
 * nothing is cropped and KLIPY's order still reads top-left first.
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
  const scrollerRef = useRef<HTMLDivElement>(null);

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

  const columns = useMemo(() => {
    const lanes = Array.from({ length: COLUMNS }, () => ({
      height: 0,
      items: [] as GifResult[],
    }));
    for (const result of stale ? [] : feed.results) {
      const lane = lanes.reduce((short, next) =>
        next.height < short.height ? next : short,
      );
      lane.items.push(result);
      lane.height += result.preview.height / result.preview.width;
    }
    return lanes.map((lane) => lane.items);
  }, [feed.results, stale]);

  const empty = !stale && feed.status === "idle" && feed.results.length === 0;
  const busy = stale || feed.status === "loading";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-1 pr-1.5">
        <MenuItem
          closeOnClick={false}
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
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-1 pb-1"
        aria-label={settled ? "GIF search results" : "Trending GIFs"}
        aria-busy={busy}
        onScroll={(event) => {
          const scroller = event.currentTarget;
          if (
            scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <
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
              <div key={index} className="flex min-w-0 flex-1 flex-col gap-1.5">
                {items.map((result) => (
                  <MenuItem
                    key={result.slug}
                    aria-label={result.title || "GIF"}
                    title={result.title || undefined}
                    className="group/gif !block overflow-hidden !rounded-2xl bg-foreground/[0.05] !p-0 transition-transform duration-200 ease-out active:scale-[0.97] motion-reduce:transition-none"
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
                  </MenuItem>
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
    </div>
  );
}
