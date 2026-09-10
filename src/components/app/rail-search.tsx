"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { RailButton } from "@/components/app/rail/rail-button";
import { useSearch } from "@/components/app/search-provider";
import { Resting } from "@/components/app/search/orb";
import { ResultRow } from "@/components/app/search/result-row";
import { useListbox } from "@/components/app/search/use-listbox";
import { useSearchHits } from "@/components/app/search/use-search-hits";
import {
  useSearchShortcut,
  useShortcutChord,
} from "@/components/app/search/use-shortcut";
import { useTheme } from "@/components/theme-provider";
import { Kbd } from "@/components/ui/kbd";
import { popupVariants } from "@/components/ui/popup";
import { Spinner } from "@/components/ui/spinner";
import { ACTIVITIES_HREF } from "@/lib/nav";
import { requestSettings } from "@/lib/preferences";
import type { Hit, SearchAction } from "@/lib/search";
import { cn } from "@/lib/utils";

/**
 * Search, at the head of the rail.
 *
 * ## What it searches
 *
 * Everything — four sources that have nothing in common but being findable,
 * asked and interleaved by `useSearchHits`, which is where that list is kept.
 *
 * ## What it looks like
 *
 * At rest it is not drawn as a field. A boxed input at the top of the rail is
 * the loudest thing in a column whose whole job is a quiet list of places, and
 * it announces itself over rows that are far more likely to be clicked. So it
 * borrows the nav row instead — same height, same icon at the same size and
 * inset, the word "Search" set exactly like a label — and is only a field once
 * you have asked it to be.
 *
 * Focus is the asking. The row then grows out of the rail on the same curve
 * and duration the invite cards grow on, and takes a surface and
 * a border while it does: one gesture, shared by every part of this chrome
 * that changes shape, so a blooming search reads as the same kind of object as
 * a widening card rather than a new trick. It holds that shape while there is
 * a query in it — a field collapsing back to bare text with words still in it
 * looks like it lost them — and settles back when it is empty and let go.
 *
 * It grows in both directions, from an anchored corner, exactly as the cards
 * do. Theirs is the bottom-left, because they sit at the foot of the rail and
 * the account button below them holds the floor; this one is at the head, so
 * the corner that stays put is the top-left and the growth goes down over the
 * destinations. Either way the edge nearest whatever opened it does not move,
 * and the rest of the rail does not shift to make room.
 *
 * The results panel underneath is measured with a `ResizeObserver` and its
 * height transitioned, which is the invite card's trick and is there for the
 * same reason: `height: auto` is not interpolable, and this panel changes size
 * under itself constantly as sections arrive. Chat's answer lands a beat after
 * everything else — it is the only source across a network — and that has to
 * grow the panel rather than snap it.
 *
 * ## What it does not do any more
 *
 * It used to push you to the activities grid on the first keystroke, because
 * the grid was the only place results could appear. The panel is that place
 * now, so typing no longer moves you. It also used to share its query with
 * that grid's own box, so a word typed on the catalogue page appeared here
 * and bloomed this box open at the same time. The query is this component's
 * alone now; the grid has its own. See `SearchProvider`.
 *
 * Collapsed, below `lg`, none of this fits in 3.75rem, so it becomes the icon
 * alone: a button that opens the grid, where the page's width makes a real
 * field possible again.
 */
export function RailSearch() {
  const { activities } = useSearch();
  const router = useRouter();
  const { setPreference } = useTheme();

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);

  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { needle, sections, hits, waiting } = useSearchHits(query, activities);

  const searching = needle !== "";
  const expanded = focused || query !== "";
  // Focus alone, rather than focus and a query. An empty panel would be the
  // obvious thing to withhold, except that this one is not empty: before you
  // have typed, it says what it is for and what it covers, which is exactly
  // the moment that is worth saying. Waiting for a keystroke would mean the
  // only people who ever learn that this searches their messages are the ones
  // who already guessed.
  const open = focused;

  function runAction(action: SearchAction) {
    // Both open the account modal; they differ in which page it lands on.
    if (action === "settings" || action === "account") {
      requestSettings(action);
      return;
    }
    setPreference(action.slice("theme:".length) as "system" | "light" | "dark");
  }

  function go(hit: Hit) {
    if (hit.href !== undefined) router.push(hit.href);
    else if (hit.action !== undefined) runAction(hit.action);
  }

  const { active, setActive, choose, onKeyDown } = useListbox({
    hits,
    open,
    query,
    setQuery,
    inputRef,
    onPick: go,
  });

  function hover(hit: Hit) {
    setActive(hits.findIndex((one) => one.id === hit.id));
  }

  const chord = useShortcutChord();
  useSearchShortcut(inputRef);

  // The panel changes height under itself: chat answers late, the query
  // narrows, a section empties. Each of those should carry the box to its new
  // size rather than snap it there. Same technique and same reasoning as
  // `InviteCard`.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const observer = new ResizeObserver(() =>
      setPanelHeight(panel.offsetHeight),
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  // Keeps an arrowed-to row inside the scroll area. `nearest` rather than
  // centring: the list is short and re-centring it on every step makes the
  // whole panel appear to move under a selection that only stepped one row.
  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  return (
    <div className="pb-2 pl-3">
      <RailButton
        aria-label="Search"
        onClick={() => router.push(ACTIVITIES_HREF)}
        className="backdrop-blur-[3px]"
      >
        <MagnifyingGlassIcon className="size-5" />
      </RailButton>

      {/* The row's resting height, held open whatever the box inside is
          doing. The box is taken out of the flow so that growing it cannot
          push the destinations down the rail: this wrapper keeps the 2.75rem
          the collapsed row occupies, and every extra pixel of the open one is
          borrowed from the shell to the right and from the list below. */}
      <search className="relative hidden h-11 rail-wide wide:block">
        <div
          className={cn(
            // Anchored top-left, which is this end of the rail's answer to the
            // invite card's bottom-left: the corner nearest the thing that
            // opened it stays exactly where it was, and the box grows away
            // from it in both directions. Pinning the other corner would slide
            // the icon and the word out from under the pointer that just
            // clicked them.
            //
            // Always absolute, never switched on open. A box that leaves the
            // flow on the same tick it starts moving has no start position to
            // move from, and jumps.
            "absolute top-0 left-0 overflow-hidden rounded-xl border",
            "transition-[width,background-color,border-color,box-shadow,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            expanded
              ? // Both widths are absolute lengths so there is something to
                // interpolate. The resting one is the rail (`wide:w-60`) less
                // this wrapper's `pl-3`; the open one is wider than the invite
                // card because it
                // has to hold two lines of somebody else's sentence. The
                // extra comes off the shell, which is why the open state is
                // the one that carries a shadow.
                //
                // The surface is the app's one popup surface, with no entrance
                // of its own — the box is already animating its width — and a
                // heavier shadow than a menu's, because this one is cast
                // across the shell rather than over a row of it.
                cn(
                  popupVariants({ motion: "none", padding: "none" }),
                  "z-30 w-[27rem] shadow-xl shadow-black/[0.1]",
                )
              : // Blurring what is behind it for the same reason the unlit nav
                // rows do: a word over the constellation's live web of lines
                // is a word with lines through it. See `RailConstellation`.
                "w-[14.25rem] border-transparent text-muted-foreground backdrop-blur-[3px] hover:bg-foreground/[0.05] hover:text-foreground",
            // Focus is what opened it, so the open surface is already the
            // focus indicator; the border only names which edge to look at.
            focused ? "border-ring" : expanded && "border-border",
          )}
        >
          {/* A label rather than a div, so the whole row is the target. The
              field inside it is transparent and borderless and gives no hint
              of where its edges are, and at rest the row reads as one nav row
              — icon, word, key cap — so a click on the icon, on the key cap,
              or on the gap between them should open it exactly as a click on
              the word does. A label delivers that for free, and does it with
              a real focus event rather than a handler pretending to be one. */}
          <label
            className={cn(
              "flex items-center gap-3 px-3 transition-[height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
              expanded ? "h-14" : "h-11 cursor-pointer",
            )}
          >
            {/* A flex child rather than absolutely placed, so it stays centred
                as the box gets taller and so the word after it lands at the nav
                rows' inset by the same `px-3` and `gap-3` they use, rather than
                by a padding that restates their arithmetic. */}
            <MagnifyingGlassIcon className="pointer-events-none size-5 shrink-0" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={onKeyDown}
              placeholder="Search"
              aria-label="Search everything"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                open && hits[active] ? hits[active].id : undefined
              }
              autoComplete="off"
              spellCheck={false}
              className={cn(
                // Transparent, borderless, and ringless: every surface this
                // has belongs to the box around it, which is the thing that
                // animates.
                "h-full min-w-0 flex-1 bg-transparent text-[0.9375rem] font-medium text-inherit outline-none",
                // Chrome draws its own clear button inside a `type="search"`
                // field. There is no room for furniture in a control that is
                // pretending not to be one.
                "[&::-webkit-search-cancel-button]:appearance-none",
                expanded
                  ? "placeholder:text-faint"
                  : "cursor-pointer placeholder:text-inherit",
              )}
            />
            {/* The shortcut, shown only on the row nobody has clicked into —
                once you are typing it is the one thing on screen that is no
                longer news. Inside the label, so it is clickable too: a key
                cap that names the way in should be one. */}
            {expanded ? null : <Kbd aria-hidden>{chord}</Kbd>}
          </label>

          {/* The panel's height is written rather than left to `auto`, which
              is not interpolable. The measured element carries its own
              `max-h`, so what the observer reports is already clamped and the
              box never tries to grow past the rail. */}
          <div
            style={{ height: open ? panelHeight : 0 }}
            className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          >
            <div
              ref={panelRef}
              id={listId}
              // Only a listbox when it holds options. With the resting panel
              // in it there is nothing to choose from, and a listbox whose
              // only child is a paragraph is a lie told to a screen reader.
              role={hits.length > 0 ? "listbox" : undefined}
              aria-label={hits.length > 0 ? "Search results" : undefined}
              // The pointer must not take focus off the field on its way to a
              // result: blurring closes the panel, and a panel that closes on
              // `mousedown` never receives the `click`. Every row would look
              // dead.
              onMouseDown={(event) => event.preventDefault()}
              className={cn(
                "max-h-[21rem] overflow-y-auto overscroll-contain border-t border-border p-1.5",
                // Held back on the way in until the box has most of its
                // height, and gone early on the way out. Sliding text up
                // behind a closing edge is the part that reads as clunky.
                "transition-opacity duration-200",
                open ? "opacity-100 delay-150" : "opacity-0",
              )}
            >
              {!searching ? (
                <Resting />
              ) : hits.length === 0 ? (
                <p
                  role="status"
                  className="px-2.5 py-10 text-center text-[0.875rem] text-muted-foreground"
                >
                  {waiting ? (
                    <Spinner className="mx-auto size-5" />
                  ) : (
                    `Nothing matches ${query.trim()}.`
                  )}
                </p>
              ) : (
                sections.map((section) => (
                  <div key={section.label} className="pb-1 last:pb-0">
                    <h2 className="px-2.5 pt-1.5 pb-1 text-[0.75rem] font-medium text-faint">
                      {section.label}
                    </h2>
                    {section.hits.map((hit) => (
                      <ResultRow
                        key={hit.id}
                        hit={hit}
                        active={hits[active]?.id === hit.id}
                        onHover={hover}
                        onPick={choose}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </search>
    </div>
  );
}
