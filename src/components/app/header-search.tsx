"use client";

import { Spinner } from "@/components/ui/spinner";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearch } from "@/components/app/search-provider";
import { useTheme } from "@/components/theme-provider";
import { conversationName } from "@/lib/chat";
import { GENRES } from "@/lib/genres";
import { ACTIVITIES_HREF, CHAT_HREF } from "@/lib/nav";
import { requestSettings } from "@/lib/preferences";
import {
  type Hit,
  messageIcon,
  needleOf,
  type SearchAction,
  scoreFolded,
  searchEntries,
} from "@/lib/search";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

const CHAT_DEBOUNCE_MS = 180;
const ENTRY_LIMIT = 4;
const ACTIVITY_LIMIT = 5;

const ORB_RINGS = [
  { lat: 74, count: 4 },
  { lat: 45, count: 9 },
  { lat: 15, count: 12 },
  { lat: -15, count: 12 },
  { lat: -45, count: 9 },
  { lat: -74, count: 4 },
] as const;

const ORB_LEVELS = [1, 0.85, 0.6, 0.38, 0.2, 0.38, 0.6, 0.85];

const ORB_DOTS = ORB_RINGS.flatMap(({ lat, count }, ring) =>
  Array.from({ length: count }, (_, index) => {
    const lon = (360 / count) * (index + (ring % 2 === 1 ? 0.5 : 0));
    const phase = (((-lon / 360) % 1) + 1) % 1;
    return {
      lat,
      lon,
      phase,
      rest: ORB_LEVELS[Math.floor(((1 - phase) % 1) * ORB_LEVELS.length)],
    };
  }),
);

export function HeaderSearch() {
  const { activities } = useSearch();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { setPreference } = useTheme();
  const { isAuthenticated } = useConvexAuth();

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [chord, setChord] = useState("\u2318K");

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const needle = needleOf(query);

  const catalogue = useMemo(
    () =>
      activities.map((activity) => ({
        slug: activity.slug,
        title: activity.title,
        genre: activity.genre,
        name: needleOf(activity.title),
        extra: needleOf(`${activity.slug} ${GENRES[activity.genre].label}`),
      })),
    [activities],
  );

  const entryHits = useMemo(() => searchEntries(needle, ENTRY_LIMIT), [needle]);

  const activityHits = useMemo<Hit[]>(() => {
    if (needle === "") return [];

    const scored: { entry: (typeof catalogue)[number]; rank: number }[] = [];
    for (const entry of catalogue) {
      const byName = scoreFolded(entry.name, needle);
      const rank =
        byName ?? (scoreFolded(entry.extra, needle) ?? Number.NaN) - 1000;
      if (Number.isNaN(rank)) continue;
      scored.push({ entry, rank });
    }

    return scored
      .sort((first, second) => second.rank - first.rank)
      .slice(0, ACTIVITY_LIMIT)
      .map(({ entry }) => ({
        id: `activity:${entry.slug}`,
        source: "activity" as const,
        title: entry.title,
        detail: GENRES[entry.genre].label,
        icon: GENRES[entry.genre].icon,
        tint: GENRES[entry.genre].hue,
        href: `${ACTIVITIES_HREF}/${entry.slug}`,
      }));
  }, [catalogue, needle]);

  const chatText = useDebounced(query.trim(), CHAT_DEBOUNCE_MS);
  const found = useQuery(
    api.chat.messages.search,
    isAuthenticated && chatText !== "" ? { text: chatText } : "skip",
  );

  const messageHits = useMemo<Hit[]>(
    () =>
      (found ?? []).map((message) => ({
        id: `message:${message._id}`,
        source: "message" as const,
        title: message.body,
        detail: `${message.authorHandle} in ${conversationName(message)}`,
        icon: messageIcon,
        href: `${CHAT_HREF}/${message.conversationId}`,
      })),
    [found],
  );

  const sections = useMemo(() => {
    const grouped: { label: string; hits: Hit[] }[] = [
      {
        label: "Pages",
        hits: entryHits.filter((hit) => hit.source === "page"),
      },
      {
        label: "Account",
        hits: entryHits.filter((hit) => hit.source === "account"),
      },
      {
        label: "Settings",
        hits: entryHits.filter((hit) => hit.source === "setting"),
      },
      { label: "Activities", hits: activityHits },
      { label: "Messages", hits: messageHits },
    ];
    return grouped.filter((section) => section.hits.length > 0);
  }, [entryHits, activityHits, messageHits]);

  const hits = useMemo(
    () => sections.flatMap((section) => section.hits),
    [sections],
  );

  const searching = needle !== "";

  const runAction = useCallback(
    (action: SearchAction) => {
      // Both open the account modal; they differ in which page it lands on.
      if (action === "settings" || action === "account") {
        requestSettings(action);
        return;
      }
      setPreference(
        action.slice("theme:".length) as "system" | "light" | "dark",
      );
    },
    [setPreference],
  );

  const choose = useCallback(
    (hit: Hit) => {
      setQuery("");
      setOpen(false);
      if (hit.href !== undefined) router.push(hit.href);
      else if (hit.action !== undefined) runAction(hit.action);
    },
    [router, runAction],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (query !== "") {
        setQuery("");
        setActive(0);
      } else {
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    if (!open || hits.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + hits.length) % hits.length);
      return;
    }

    if (event.key === "Enter") {
      const hit = hits[active];
      if (hit) {
        event.preventDefault();
        choose(hit);
      }
    }
  }

  // Detect non-Mac platform
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof navigator !== "undefined" && !navigator.userAgent.includes("Mac")) {
        setChord("Ctrl K");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard shortcut ⌘K / Ctrl K
  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  // Click outside to dismiss
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep highlighted item in view
  useEffect(() => {
    if (!open) return;
    listboxRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  return (
    <div ref={containerRef} className="relative flex-1 max-w-sm sm:max-w-md">
      <div
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-foreground/[0.03] px-3 transition-colors",
          "focus-within:border-ring focus-within:bg-background focus-within:ring-1 focus-within:ring-ring",
          open && "border-ring bg-background ring-1 ring-ring",
        )}
      >
        <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search activities, messages…"
          aria-label="Search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && hits[active] ? hits[active].id : undefined
          }
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-[0.875rem] font-medium text-foreground placeholder:text-muted-foreground outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActive(0);
              inputRef.current?.focus();
            }}
            className="flex size-4 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <XMarkIcon className="size-3.5" />
          </button>
        ) : (
          <kbd
            aria-hidden
            className="hidden shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground sm:inline-block"
          >
            {chord}
          </kbd>
        )}
      </div>

      {open && (
        <div
          ref={listboxRef}
          id={listId}
          role={hits.length > 0 ? "listbox" : undefined}
          aria-label={hits.length > 0 ? "Search results" : undefined}
          onMouseDown={(event) => event.preventDefault()}
          className="popup-slide absolute top-full left-0 z-50 mt-1.5 w-full min-w-[18rem] sm:min-w-[24rem] overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl shadow-black/[0.1]"
        >
          <div className="max-h-[22rem] overflow-y-auto overscroll-contain">
            {!searching ? (
              <Resting />
            ) : hits.length === 0 ? (
              <p
                role="status"
                className="px-3 py-8 text-center text-[0.875rem] text-muted-foreground"
              >
                {found === undefined && chatText !== ""
                  ? <Spinner className="mx-auto size-5" />
                  : `Nothing matches "${query.trim()}".`}
              </p>
            ) : (
              sections.map((section) => (
                <div key={section.label} className="pb-1 last:pb-0">
                  <p className="px-2.5 pt-1.5 pb-1 text-[0.75rem] font-medium text-muted-foreground">
                    {section.label}
                  </p>
                  {section.hits.map((hit) => (
                    <Row
                      key={hit.id}
                      hit={hit}
                      active={hits[active]?.id === hit.id}
                      onHover={() =>
                        setActive(hits.findIndex((one) => one.id === hit.id))
                      }
                      onPick={() => choose(hit)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Resting() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-6">
      <div aria-hidden className="pixel-orb text-primary">
        <div className="pixel-orb-shell">
          {ORB_DOTS.map((dot) => (
            <span
              key={`${dot.lat}:${dot.lon}`}
              className="pixel-orb-dot"
              style={
                {
                  "--lat": dot.lat,
                  "--lon": dot.lon,
                  "--phase": dot.phase,
                  "--rest": dot.rest,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <p className="mt-4 text-[0.875rem] font-medium text-foreground">
        Search anything
      </p>
      <p className="mt-1 text-center text-[0.8125rem] leading-relaxed text-muted-foreground">
        Activities, messages, pages, settings, and your account.
      </p>
    </div>
  );
}

function Row({
  hit,
  active,
  onHover,
  onPick,
}: {
  hit: Hit;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const Icon = hit.icon;

  return (
    <div
      id={hit.id}
      role="option"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      onMouseMove={onHover}
      onClick={onPick}
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
        active && "bg-foreground/[0.05]",
      )}
    >
      <Icon
        aria-hidden
        style={hit.tint ? { color: hit.tint } : undefined}
        className={cn(
          "size-4 shrink-0",
          hit.tint ? undefined : active ? "text-foreground" : "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] font-medium text-foreground">
          {hit.title}
        </span>
        {hit.detail ? (
          <span className="block truncate text-[0.8125rem] text-muted-foreground">
            {hit.detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
