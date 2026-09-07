"use client";

import { Spinner } from "@/components/ui/spinner";

import { useClerk } from "@clerk/nextjs";
import { MagnifyingGlassIcon } from "@heroicons/react/24/solid";
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
import { flushSync } from "react-dom";
import { useRail } from "@/components/app/rail-context";
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

/**
 * How long a keystroke sits before chat is asked about it.
 *
 * Everything else in this panel is answered in the browser, from lists that
 * are already here, so it moves on the frame you type. Messages are a Convex
 * query, and a Convex query is a live subscription — one per distinct
 * argument. Sending every prefix of what someone types would open and abandon
 * a subscription per letter, which is a lot of work for eight answers nobody
 * read. Long enough to skip the middle of a word, short enough that the chat
 * section lands while you are still looking at the panel.
 */
const CHAT_DEBOUNCE_MS = 180;

/** How many static results — destinations and settings together — can show.
 *  They are capped as one list so the best few survive whichever kind they
 *  are, rather than three mediocre pages holding a place above an exact
 *  settings match. */
const ENTRY_LIMIT = 4;

/** How many activities. The catalogue is by far the largest source and would
 *  otherwise be the whole panel for any common word. */
const ACTIVITY_LIMIT = 5;

/**
 * Search, at the head of the rail.
 *
 * ## What it searches
 *
 * Everything, which here means four sources that have nothing in common but
 * being findable:
 *
 * - the **destinations** in `src/lib/nav.ts`, and the account, which is a door
 *   out to the hosted profile UI rather than a page here;
 * - the **settings**, written down as searchable entries in `src/lib/search.ts`
 *   because a switch has no text in it to index;
 * - the **activity catalogue**, handed to the browser as a prop by the
 *   dashboard layout — never imported, see `SearchProvider`;
 * - **chat messages**, through a Convex full-text index, filtered on the
 *   server to the conversations the caller is actually in. See `search` in
 *   `convex/chat/messages.ts`, which is where that promise is kept.
 *
 * They are not merged into one index and could not be: three of them live in
 * different processes. Each answers for itself and this component interleaves
 * the answers into one list, in a fixed order — the small precise sources
 * first, then the catalogue, then chat — so the panel is predictable rather
 * than reshuffling itself as the relative scores of four unrelated ranking
 * schemes cross over.
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

  const [query, setQuery] = useState("");
  const { setPreference } = useTheme();
  const { openUserProfile } = useClerk();
  const { isAuthenticated } = useConvexAuth();

  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  // Which chord to print in the hint. Both work everywhere — see the shortcut
  // effect below — so this is only about naming the one the reader has, and it
  // starts on the Mac spelling because that is what the server renders and a
  // first paint that disagrees with the markup is a hydration error. The
  // correction lands on mount, before anybody has read a 11px key cap.
  const [chord, setChord] = useState("\u2318K");

  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const needle = needleOf(query);

  /* ---------------------------------------------------------------- sources */

  // The catalogue, folded once. See `scoreFolded` — this is the array that
  // makes it worth having: 318 activities scored on every keystroke, against
  // strings that were normalised when the prop arrived rather than each time.
  const catalogue = useMemo(
    () =>
      activities.map((activity) => ({
        slug: activity.slug,
        title: activity.title,
        genre: activity.genre,
        name: needleOf(activity.title),
        // The slug and the genre, so "puzzle" finds the shelf's worth and a
        // remembered URL fragment finds the one. Held below the title by
        // `scoreFolded`'s caller, not by being weaker text.
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

  // The raw query rather than the folded one: Convex's search index does its
  // own tokenising and stemming, and handing it a string with the punctuation
  // already beaten out would be second-guessing that.
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
        // The message is the result; who said it and where is the caption.
        // The other way round would make every row in this section look the
        // same until you read the second line.
        title: message.body,
        detail: `${message.authorHandle} in ${conversationName(message)}`,
        icon: messageIcon,
        href: `${CHAT_HREF}/${message.conversationId}`,
      })),
    [found],
  );

  /* ------------------------------------------------------------------ shape */

  // Rendered in this order and navigated in this order, which is the whole
  // reason it is one array: a keyboard walking the list and an eye walking the
  // panel have to agree, and two lists could drift.
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
  const expanded = focused || query !== "";
  // Focus alone, rather than focus and a query. An empty panel would be the
  // obvious thing to withhold, except that this one is not empty: before you
  // have typed, it says what it is for and what it covers, which is exactly
  // the moment that is worth saying. Waiting for a keystroke would mean the
  // only people who ever learn that this searches their messages are the ones
  // who already guessed.
  const open = focused;

  // Whatever was highlighted a keystroke ago is meaningless now — the list it
  // indexed no longer exists. Back to the top, which is also the result the
  // ranking thinks is most likely to be right.
  //
  // Keyed to the ids rather than to `hits`, so chat's answer arriving with the
  // same rows in it does not throw away a selection someone has arrowed down
  // to. Sections do not reorder, so the index stays pointing at what it did.
  const shape = hits.map((hit) => hit.id).join(" ");
  useEffect(() => setActive(0), [shape]);

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

  /* --------------------------------------------------------------- activate */

  const runAction = useCallback(
    (action: SearchAction) => {
      if (action === "settings") {
        requestSettings();
        return;
      }
      if (action === "account") {
        openUserProfile();
        return;
      }
      setPreference(
        action.slice("theme:".length) as "system" | "light" | "dark",
      );
    },
    [openUserProfile, setPreference],
  );

  const choose = useCallback(
    (hit: Hit) => {
      // The query is spent either way. Leaving it in the box would leave the
      // panel open over the page it just took you to.
      setQuery("");
      inputRef.current?.blur();

      if (hit.href !== undefined) router.push(hit.href);
      else if (hit.action !== undefined) runAction(hit.action);
    },
    [router, runAction, setQuery],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      // Two steps, in the order they are wanted: clear what you typed, and
      // only give up the box if there was nothing to clear.
      if (query !== "") setQuery("");
      else inputRef.current?.blur();
      return;
    }

    if (!open || hits.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // Wrapping, because a list this short has no scrollbar to tell you that
      // you have reached the end of it.
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

  useEffect(() => {
    if (!navigator.userAgent.includes("Mac")) setChord("Ctrl K");
  }, []);

  // The one shortcut this app has. A search you have to find with the mouse is
  // a search nobody uses from the middle of a page, and the two chords are the
  // two every palette on the web answers to.
  //
  // The panic key is recorded separately and may be anything; if somebody
  // chose this one, its handler replaces the whole page and wins outright —
  // which is the right outcome for a key whose entire purpose is winning.
  //
  // A collapsed rail has no box to focus, so the shortcut opens it first. The
  // box is in the layout on the same frame `data-rail` changes — `display`
  // flips at once and only the opacity waits, see `rail-wide` in
  // `globals.css` — so the only thing between this handler and a focusable
  // field is React committing the state, and `flushSync` is what makes that
  // happen here rather than after the handler returns. Below `lg` the box is
  // hidden by the viewport and the focus goes nowhere, as it always has.
  const { rail, setRail } = useRail();
  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (rail === "closed") flushSync(() => setRail("open"));
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [rail, setRail]);

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
      <button
        type="button"
        aria-label="Search"
        onClick={() => router.push(ACTIVITIES_HREF)}
        className="rail-narrow flex h-11 w-full cursor-pointer items-center justify-center rounded-lg text-muted-foreground backdrop-blur-[3px] hover:bg-foreground/[0.05] hover:text-foreground wide:hidden"
      >
        <MagnifyingGlassIcon className="size-5" />
      </button>

      {/* The row's resting height, held open whatever the box inside is
          doing. The box is taken out of the flow so that growing it cannot
          push the destinations down the rail: this wrapper keeps the 2.75rem
          the collapsed row occupies, and every extra pixel of the open one is
          borrowed from the shell to the right and from the list below. */}
      <search className="rail-wide relative hidden h-11 wide:block">
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
                "z-30 w-[27rem] bg-popover text-foreground shadow-xl shadow-black/[0.1]"
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
            {expanded ? null : (
              <kbd
                aria-hidden
                className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[0.6875rem] font-medium text-faint"
              >
                {chord}
              </kbd>
            )}
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
                  {found === undefined && chatText !== ""
                    ? <Spinner className="mx-auto size-5" />
                    : `Nothing matches ${query.trim()}.`}
                </p>
              ) : (
                sections.map((section) => (
                  <div key={section.label} className="pb-1 last:pb-0">
                    <h2 className="px-2.5 pt-1.5 pb-1 text-[0.75rem] font-medium text-faint">
                      {section.label}
                    </h2>
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
        </div>
      </search>
    </div>
  );
}

/**
 * Where the orb's dots sit: one ring per latitude, and how many are on it.
 *
 * Counts fall off towards the poles roughly as the circumference does, which
 * is what keeps the spacing even over the surface — equal counts per ring
 * would crowd the top and bottom into two tight knots. Latitudes stop short of
 * ±90 so there is no dot exactly on the axis; a pole dot does not move as the
 * sphere turns, and one stationary point in the middle of fifty moving ones is
 * the thing your eye goes to.
 */
const ORB_RINGS = [
  { lat: 74, count: 4 },
  { lat: 45, count: 9 },
  { lat: 15, count: 12 },
  { lat: -15, count: 12 },
  { lat: -45, count: 9 },
  { lat: -74, count: 4 },
] as const;

/**
 * The eight brightness levels a dot steps through in one revolution, starting
 * with it facing the camera. Mirrored around the halfway point because the
 * back of a sphere is the front of it seen later — see `pixel-orb-face` in
 * `globals.css`, which is these numbers as keyframes.
 */
const ORB_LEVELS = [1, 0.85, 0.6, 0.38, 0.2, 0.38, 0.6, 0.85];

/**
 * Every dot, placed and timed once at module load.
 *
 * `phase` is the fraction of a revolution at which this dot faces the camera —
 * a dot at longitude L gets there when the shell has turned by -L — and is
 * what the CSS turns into an `animation-delay`. `rest` is the level that phase
 * lands on at rotation zero, written onto the dot as its plain `opacity` so
 * that a sphere with its animations collapsed is still a *shaded* sphere.
 *
 * Alternate rings are offset by half a step, so the dots do not line up into
 * vertical columns that flicker as they cross the silhouette.
 */
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

/**
 * The panel before anything has been typed.
 *
 * It exists to answer the question the collapsed row cannot: not "is there a
 * search here" — the word "Search" said that — but "a search of what". A rail
 * search box is assumed to search the page it is next to, and this one does
 * not; it reaches into the catalogue, into your conversations and into the
 * settings, and none of that is guessable from a magnifying glass. So it is
 * written down, once, in the half-second before the first keystroke.
 *
 * The orb above it is decoration and is not pretending otherwise. It is not a
 * spinner: nothing is loading, there is no request behind it, and it turns at
 * the same rate whether the app is busy or idle. It is here because a panel
 * that opens onto two lines of grey text is a panel that opens onto nothing,
 * and because fifty hard-edged pixels shaded in eight bands is the one piece
 * of motion in this app that looks like it came off a machine rather than out
 * of a design tool. See `.pixel-orb` in `globals.css` for how it is built.
 */
function Resting() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-8">
      {/* The accent, which is a preference — so the one ornament in the search
          is painted in whatever colour the person picked for the app. */}
      <div aria-hidden className="pixel-orb text-primary">
        <div className="pixel-orb-shell">
          {ORB_DOTS.map((dot) => (
            <span
              key={`${dot.lat}:${dot.lon}`}
              className="pixel-orb-dot"
              // Four numbers, all derived from where the dot is: two place it
              // on the sphere, one times its brightness against the shell's
              // rotation, and one is that brightness at a standstill. Deriving
              // them from one longitude is what keeps the lit face contiguous.
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

      <p className="mt-5 text-[0.9375rem] font-medium text-foreground">
        Search anything
      </p>
      <p className="mt-1 text-center text-[0.8125rem] leading-relaxed text-muted-foreground">
        Activities, messages, pages, settings, and your account.
      </p>
    </div>
  );
}

/**
 * One result.
 *
 * A `div` with `role="option"` rather than a button or a link, because it is
 * one: the field keeps focus the whole time — that is what makes the arrow
 * keys work — and a focusable control inside a listbox the user is not
 * focusing is a tab stop that goes nowhere. Navigation is `router.push` in
 * `choose`, which is what a `Link` would have done.
 *
 * Highlight follows the pointer as well as the arrows, and they write to the
 * same state, so moving the mouse over the list does not leave two rows
 * looking chosen.
 */
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
    // biome-ignore lint/a11y/useKeyWithClickEvents: the listbox is driven from
    // the input's own key handler, which is what `aria-activedescendant` is
    // for; this element is never focused and so can never receive a key event.
    <div
      id={hit.id}
      role="option"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      onMouseMove={onHover}
      onClick={onPick}
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
        active && "bg-foreground/[0.05]",
      )}
    >
      <Icon
        aria-hidden
        style={hit.tint ? { color: hit.tint } : undefined}
        className={cn(
          "size-4 shrink-0",
          hit.tint ? undefined : active ? "text-foreground" : "text-faint",
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

/**
 * A value that only changes once it has stopped changing.
 *
 * Here for exactly one caller — the chat query — and written out rather than
 * pulled from a library because it is nine lines and the alternative is a
 * dependency in the rail. See `CHAT_DEBOUNCE_MS`.
 */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
