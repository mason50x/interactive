"use client";

import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import emojiData from "emojibase-data/en/compact.json";
import { useMemo, useRef, useState } from "react";
import { MenuItem } from "@/components/ui/menu";
import { LineSearch } from "@/components/ui/line-search";
import { useFlip } from "@/lib/use-flip";

type Emoji = {
  unicode: string;
  label: string;
  group?: number;
  tags?: string[];
};

const EMOJIS = (emojiData as Emoji[]).filter(
  (emoji) =>
    emoji.group !== undefined && emoji.group !== 2 && emoji.unicode !== "",
);
const PAGE_SIZE = 140;

export default function EmojiPicker({
  onBack,
  onPick,
}: {
  onBack: () => void;
  onPick: (emoji: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const matches = useMemo(
    () =>
      normalized
        ? EMOJIS.filter(
            (emoji) =>
              emoji.label.toLocaleLowerCase().includes(normalized) ||
              emoji.tags?.some((tag) =>
                tag.toLocaleLowerCase().includes(normalized),
              ),
          )
        : EMOJIS,
    [normalized],
  );
  const shown = useMemo(
    () => matches.slice(0, visibleCount),
    [matches, visibleCount],
  );
  const { frame, ghosts } = useFlip(shown);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MenuItem
        closeOnClick={false}
        onClick={onBack}
        className="mb-1 font-medium"
      >
        <ArrowLeftIcon className="size-4" />
        Emojis
      </MenuItem>
      <div className="mx-1 mb-2" onKeyDown={(event) => event.stopPropagation()}>
        <LineSearch
          value={query}
          onChange={(value) => {
            setQuery(value);
            setVisibleCount(PAGE_SIZE);
            if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
          }}
          label="Search emojis"
          placeholder="Search emojis"
        />
      </div>
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1"
        aria-label={normalized ? "Emoji search results" : "All emojis"}
        onScroll={(event) => {
          const scroller = event.currentTarget;
          if (
            scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <
            120
          ) {
            setVisibleCount((count) =>
              Math.min(matches.length, count + PAGE_SIZE),
            );
          }
        }}
      >
        <div ref={frame} className="relative">
          {matches.length ? (
            <div className="grid grid-cols-7 gap-0.5">
              {shown.map((emoji) => (
                <MenuItem
                  key={emoji.unicode}
                  data-flip={emoji.unicode}
                  aria-label={emoji.label}
                  title={emoji.label}
                  className="!flex size-9 !justify-center !gap-0 !p-0 text-xl"
                  onClick={() => onPick(emoji.unicode)}
                >
                  {emoji.unicode}
                </MenuItem>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No emojis found
            </p>
          )}
          <div
            ref={ghosts}
            inert
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          />
        </div>
      </div>
    </div>
  );
}
