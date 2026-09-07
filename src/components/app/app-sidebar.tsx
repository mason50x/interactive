"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "@/components/app/chat/chat-provider";
import { AnnouncementsCard } from "@/components/app/announcements-card";
import { InviteCard } from "@/components/app/invite-card";
import { RailConstellation } from "@/components/app/rail-constellation";
import {
  RailContext,
  type RailContextValue,
  useRail,
} from "@/components/app/rail-context";
import { usePreferences } from "@/components/preferences-provider";
import { RailSearch } from "@/components/app/rail-search";
import { UserMenu } from "@/components/app/user-menu";
import { NAV_HREFS, navItems } from "@/lib/nav";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import { type RailState, rememberRailState } from "@/lib/rail";
import { cn } from "@/lib/utils";
import { useWarmRoutes } from "@/lib/warm";

/**
 * The signed-in app's chrome: a vertical rail, not a header.
 *
 * The dashboard is a workspace rather than a page in the site, so it takes
 * none of the marketing chrome — no `SiteHeader` with its hover panels, no
 * `SiteFooter` with its legal links. Navigation, brand, and account all live
 * in this one column.
 *
 * It does not scroll and does not need `position: sticky` to manage it. The
 * layout is a viewport-height row in which this rail is a full-height, fixed
 * -width column, so the only thing that can scroll is the shell beside it.
 *
 * The rail draws no border of its own and paints no background: it sits on
 * the layout's chrome, which carries on around every side of the shell. The
 * shell's own border is what draws the edge between them, so a line here would
 * only be a second one.
 *
 * Rows are padded on the left and run flush to the rail's right edge, where
 * the shell's own 12px margin picks up. That is what puts the same 12px of
 * chrome on both sides of every hover blob and of the account popup, while
 * leaving the labels where left-aligned text belongs. Change the shell's
 * margin and this stops being true.
 *
 * Below `lg` it drops to icons, so the layout never has to reflow into a top
 * bar. At `lg` and up it can be dropped to icons on request — the control for
 * that sits beside the mark, and the icon rail has one to open it back up —
 * and that request is the one piece of state here: `data-rail` on the nav,
 * which every two-shaped thing inside reads through the `wide:` and `narrow:`
 * variants (see `globals.css`), and a cookie so the next load starts there
 * (see `src/lib/rail.ts`).
 *
 * The move between the two is one width transition on the nav, and the rest
 * of the rail is arranged so that it can follow that transition rather than
 * jump at the end of it: every row keeps its icon at the same offset from the
 * left in both shapes, give or take a margin that eases, and hides its label
 * by clipping and fading rather than by removing it. What cannot follow — the
 * search box, the cards, the account row's name — is swapped instead, on the
 * timing `rail-wide` and `rail-narrow` in `globals.css` describe.
 *
 * `isolate` is here for `RailConstellation`, which sits at `-z-10`: without a
 * stacking context of its own on this column, that layer would drop behind the
 * layout's `bg-sidebar` and never be seen.
 *
 * `z-30` is what keeps the rail *above* the shell beside it. The rail comes
 * first in document order, so with both at `z-index: auto` anything positioned
 * inside the shell paints over it — and the invite panel is the one thing here
 * that leaves the rail's own column, widening across the shell's left edge
 * when it opens. Everything the shell floats sits below this: the activities
 * filter bar at `z-20`, its shelf arrows at `z-10`.
 */
export function AppSidebar({ initialRail }: { initialRail: RailState }) {
  const pathname = usePathname();
  const { preferences } = usePreferences();
  const { hasUnread } = useChat();

  // The width asked for. Seeded from the cookie the layout read, so the first
  // frame is the remembered one, and written back on every change. Below `lg`
  // the rail is icons whatever this says; see the `wide:` variant.
  const [rail, setRail] = useState<RailState>(initialRail);

  // Whether it has ever been toggled in this document. The swapped elements
  // do not animate until it has — see `rail-wide` in `globals.css` for why a
  // rail that has not moved must not fade anything in.
  const [moved, setMoved] = useState(false);

  const changeRail = useCallback((state: RailState) => {
    setRail(state);
    setMoved(true);
    rememberRailState(state);
  }, []);

  const railContext = useMemo<RailContextValue>(
    () => ({ rail, setRail: changeRail }),
    [rail, changeRail],
  );
  const list = useRef<HTMLUListElement>(null);
  const [pill, setPill] = useState<{ top: number; height: number } | null>(
    null,
  );

  // The row that has been clicked and is waiting on the server, if any. See
  // `NavPending` at the bottom of this file for why this is state up here
  // rather than something each row reads for itself.
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Functional, and matched on the way down, so two rows reporting in either
  // order cannot leave a stale one lit: only the row that claimed the pending
  // state can release it.
  const report = useCallback((href: string, pending: boolean) => {
    setPendingHref((current) =>
      pending ? href : current === href ? null : current,
    );
  }, []);

  // Exactly one item is lit: the one whose href is the *longest* prefix of the
  // current path. Testing each item on its own would light every ancestor too,
  // and since every route here sits under `/dashboard`, an item pointing at
  // the root would be lit on every page of the app.
  // An activity is running in a frame beside this rail, and an activity is the most
  // expensive thing this app ever puts on a screen. The constellation is
  // decoration; it stays, but dimmed and slowed and at half its frame rate
  // while the machine has real work to do, and wakes back up the moment you
  // leave the activity. Every other route has it at full strength.
  //
  // Read off the path rather than signalled from the page, because the page is
  // a server component — see `src/app/dashboard/activities/[slug]/page.tsx`.
  // `/dashboard/activities` itself is the browser, not an activity, so this wants
  // the trailing segment and not just the prefix.
  const viewing = /^\/dashboard\/activities\/[^/]+/.test(pathname);

  const activeHref = navItems.reduce((best, item) => {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    return matches && item.href.length > best.length ? item.href : best;
  }, "");

  // Which row wears the pill. A click lights its row *now* and lets the URL
  // catch up, rather than the other way round: every route under `/dashboard`
  // reads cookies and so is rendered on demand, and until `src/lib/warm.ts` has
  // been round the rail the answer arrives some hundreds of milliseconds after
  // the click. Waiting for `pathname` to move means waiting all of that with
  // the rail showing the row you just left — which reads as a click that
  // missed, and gets clicked again.
  //
  // Only the pill and the ink follow this. `aria-current` stays on the route
  // actually being shown, because that is what it means; a screen reader saying
  // "current page" of a page that has not arrived is a lie, and a navigation
  // that fails would leave it as one.
  const litHref = pendingHref ?? activeHref;

  const warm = useWarmRoutes(NAV_HREFS, pathname);

  // Where the lit face has to be. Read off the row rather than computed from
  // the row height and the gap, so the two cannot drift apart: this is laid
  // out by Tailwind classes a few lines below, and arithmetic here would be a
  // second copy of them that nothing checks.
  //
  // A layout effect, not an effect: the pill is placed in the same frame the
  // row is, so it never paints at the wrong end of the list first. Measuring
  // needs no observer — every row is a fixed `h-11`, at both widths of the
  // rail, so nothing but the selection moves them.
  useLayoutEffect(() => {
    const row = list.current?.querySelector<HTMLElement>('[data-lit="true"]');
    setPill(row ? { top: row.offsetTop, height: row.offsetHeight } : null);
  }, [litHref]);

  return (
    <RailContext value={railContext}>
      <nav
        aria-label="Dashboard"
        data-rail={rail}
        data-rail-moved={moved ? "" : undefined}
        className="relative isolate z-30 flex w-[4.5rem] shrink-0 flex-col transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:w-60"
      >
        {preferences.constellation && <RailConstellation quiet={viewing} />}

        {/* Also the only route back to `/dashboard` itself: the overview has
            no row of its own in the list.

            One lockup at both widths, not two. The mark is sized in `em`, so
            easing the font size is what carries it between the icon rail's
            larger cut and the labelled rail's smaller one, and the name is
            swapped out from beside it rather than the whole thing replaced.
            The padding eases too: it is what centres the mark over the icon
            column at one width and puts it on the labels' left edge at the
            other. `overflow-hidden` is for the name on the way out — it is
            wider than the rail it is leaving.

            The narrow padding is the icon column's centre less half the mark:
            the rows below are 60px wide behind a 12px inset, so their icons
            sit on the 42px line, and the mark at 1.375rem is 17.6px wide.
            Change the mark's size or the rail's width and this moves. */}
        <div className="flex h-16 items-center overflow-hidden pl-[2.0625rem] transition-[padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:pl-5">
          <Link
            href="/dashboard"
            aria-label={`${brand.name} dashboard`}
            {...warm("/dashboard")}
            className="rounded-full backdrop-blur-[3px] transition-opacity hover:opacity-70"
          >
            <Wordmark
              short
              className="text-[1.375rem] transition-[font-size] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:text-[1.0625rem]"
              nameClassName="rail-wide hidden wide:inline [--rail-leave:150ms]"
            />
          </Link>

          {/* Flush to the rail's right edge like every row below it, and for
              the same reason: the shell's margin is the chrome on that side. */}
          <RailToggle
            to="closed"
            label="Collapse sidebar"
            className="rail-wide ml-auto hidden size-9 rounded-lg wide:flex"
          />
        </div>

        {/* The way back. Below `lg` there is no wide rail to open, so this is
            the one place the two narrow cases part: it exists in the collapsed
            one only. A row of its own rather than a hover state on the mark,
            because a control that only appears when the pointer happens to be
            over the thing it replaced is a control that has to be discovered. */}
        <div className="rail-narrow hidden pb-2 pl-3 collapsed:block">
          <RailToggle
            to="open"
            label="Expand sidebar"
            className="h-11 w-full rounded-lg"
          />
        </div>

        <RailSearch />

        {/* The rail can outgrow a short viewport once there are enough
          destinations, so the list — and only the list — is allowed to
          scroll inside it. */}
        <ul
          ref={list}
          className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-2 pl-3"
        >
          {/* One face for the whole list, travelling between rows. It is first in
            the list and the rows are positioned too, so they paint over it in
            document order and it stays behind their labels — no z-index.

            Nothing animates on the first placement: a freshly inserted element
            has no previous position to transition from, so a cold load draws it
            where it belongs rather than sliding it in from the top row. */}
          {pill ? (
            <span
              aria-hidden
              className="nav-pill pointer-events-none absolute top-0 right-0 left-3 rounded-lg border transition-[transform,height] duration-200 ease-out"
              style={{
                height: pill.height,
                transform: `translateY(${pill.top}px)`,
              }}
            />
          ) : null}

          {navItems.map((item) => {
            const active = item.href === activeHref;
            const lit = item.href === litHref;
            const { outline: Outline, solid: Solid } = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-lit={lit ? "true" : undefined}
                  {...warm(item.href)}
                  className={cn(
                    // Positioned so it paints above the pill, and bordered on the
                    // base — transparent — so the label sits at the same inset
                    // whether or not the pill is under it.
                    //
                    // The same padding at both widths, and `overflow-hidden`: the
                    // label is never removed, only clipped by the row's edge as
                    // the rail narrows and faded on the way. That is what lets a
                    // row follow the width transition instead of jumping at the
                    // end of it — and the icon rail's rows carry a real name for
                    // a screen reader, which the old `lg:inline` label did not.
                    "relative flex h-11 items-center gap-3 overflow-hidden rounded-lg border border-transparent px-3 text-[0.9375rem] font-medium whitespace-nowrap",
                    // The global focus ring is a 2px outline held 2px off the
                    // element — around a row that is already filled blue it lands
                    // as a second, brighter border. These get an inset ring
                    // instead, which sits inside the face rather than orbiting it.
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                    lit
                      ? // The ink is switched, not faded: zero duration behind a
                        // delay, so the label holds the colour it already had and
                        // then changes in one frame. Anything that interpolates
                        // spends that time part-way between a dark label and a
                        // white one, and the pointer that clicked the row left it
                        // hovered — which is to say nearly black — so what fades
                        // is black text across arriving blue.
                        //
                        // The delay is when the pill covers this label, not when
                        // it stops: `ease-out` puts it here about a third of the
                        // way through the 200ms, and the switch has to land under
                        // cover. Retime it if that travel changes.
                        //
                        // The weight rides the same beat, and for the same
                        // reason. A lit row is set heavier than an unlit one —
                        // white on a filled face needs the extra stroke to hold
                        // its edges — and thickening a word changes its width,
                        // so the letters shuffle. That has to happen under the
                        // pill too, which is why `font-weight` is in the
                        // transition list rather than left to change on the
                        // frame the URL does.
                        "font-semibold text-primary-foreground transition-[color,font-weight] delay-[70ms] duration-0"
                      : // Only the unlit rows blur what is behind them, and it
                        // is the constellation they are blurring — a label over
                        // a live web of lines is a label with lines through it.
                        // The lit row is excluded because the only thing under
                        // it is the pill, whose rounded edge a backdrop filter
                        // would smear inward. See `RailConstellation`.
                        "text-muted-foreground backdrop-blur-[3px] transition-[background-color,color] duration-150 hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  {/* Both cuts are drawn, stacked, and traded on the same
                    beat as the colour above — a single `Icon` swapped on the
                    route would change shape the instant the URL did, which is
                    a solid glyph appearing on the bare rail 70ms before the
                    pill and the white arrive to explain it, and an outline one
                    popping onto the face the pill has not left yet. Opacity is
                    switched, not faded, for the same reason the colour is: a
                    half-drawn glyph over a half-arrived pill is worse than
                    either end of it. */}
                  {/* The margin is what centres the icon in the narrow rail —
                    padding plus margin plus half the icon lands on the middle
                    of the 60px row — and eases to nothing as the labels
                    arrive, so the icon slides its 8px rather than hopping. */}
                  <span className="relative ml-2 size-5 shrink-0 transition-[margin] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:ml-0">
                    <Outline
                      className={cn(
                        "absolute inset-0 size-5 transition-[opacity] delay-[70ms] duration-0",
                        lit && "opacity-0",
                      )}
                    />
                    <Solid
                      className={cn(
                        "absolute inset-0 size-5 transition-[opacity] delay-[70ms] duration-0",
                        !lit && "opacity-0",
                      )}
                    />
                  </span>
                  <span className="opacity-0 transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:opacity-100">
                    {item.label}
                  </span>

                  {/* A dot and never a number. The rail is a list of places, and
                    a count on it would be a second thing to read on a row whose
                    whole job is to be recognised at a glance — the conversation
                    list is where "how many, and from whom" belongs.

                    Absolutely positioned on the icon rather than placed after
                    the label, because below `lg` there is no label to place it
                    after and the row must not change shape between the two
                    widths. It rides the same colour switch as everything else
                    on a lit row: white on the pill, brand blue off it. */}
                  {item.unread && hasUnread ? (
                    <span
                      aria-label="Unread messages"
                      role="status"
                      className={cn(
                        // Two transitions with two clocks: the colour switch on
                        // the pill's beat, and the slide between its two offsets
                        // on the rail's.
                        "absolute top-2.5 left-[2.125rem] size-2 rounded-full [transition:background-color_0s_70ms,left_300ms_cubic-bezier(0.32,0.72,0,1)] wide:left-[1.9375rem]",
                        lit ? "bg-primary-foreground" : "bg-primary",
                      )}
                    />
                  ) : null}

                  <NavPending href={item.href} report={report} />
                </Link>
              </li>
            );
          })}
        </ul>

        {/* The allowance sits above the account button rather than inside its
          menu: it is the one thing in this chrome that moves on its own, and
          a number you have to open a popup to read is a number nobody reads.
          It renders nothing while invites are switched off on the server.
          See `InviteCard`. */}
        <AnnouncementsCard />
        <InviteCard />

        {/* Nothing links back to the marketing site: `/` bounces a live session
          straight back here, so it would be a round trip to nowhere. */}
        <div className="shrink-0 pb-3 pl-3">
          <UserMenu />
        </div>
      </nav>
    </RailContext>
  );
}

/**
 * One half of the collapse control: the button in the header that closes the
 * rail, or the row in the icon rail that opens it. Which is `to`; the caller
 * shapes it. Both are drawn as one of the rail's own hover surfaces, and take
 * the inset focus ring the nav rows do for the reason given there.
 *
 * No `transition-colors`: both halves carry `rail-wide` or `rail-narrow` (or
 * sit inside one), and those own the transition list. See `globals.css`.
 */
function RailToggle({
  to,
  label,
  className,
}: {
  to: RailState;
  label: string;
  className?: string;
}) {
  const { setRail } = useRail();

  return (
    <button
      type="button"
      onClick={() => setRail(to)}
      aria-label={label}
      title={label}
      className={cn(
        "flex cursor-pointer items-center justify-center text-muted-foreground backdrop-blur-[3px] outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
        className,
      )}
    >
      <RailIcon className="size-5" />
    </button>
  );
}

/**
 * The collapse glyph: a window with its left column marked off. Drawn here
 * because Heroicons has no sidebar, and drawn to its outline set's rules — 24
 * on the grid, a 1.5 stroke, round caps and joins — so it sits beside the
 * nav rows' icons as one of them. The same glyph both ways: it names the
 * thing being moved, and the label says which way.
 */
function RailIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M9 4.5v15" />
    </svg>
  );
}

/**
 * Reports whether the row it sits in has been clicked and is still waiting.
 *
 * `useLinkStatus` only answers inside a `Link`, so this has to be a child of
 * one — which is also why the pending row is state on `AppSidebar` and not on
 * each row: the pill is one element for the whole list, so the list is what has
 * to know which row to send it to.
 *
 * Renders nothing. The visible half of this is the pill and the ink, which the
 * rail already knows how to move.
 *
 * The cleanup releases the claim as well as the effect, so a row unmounting
 * mid-navigation cannot leave the rail lit on a destination nobody is going to.
 * Both paths report the same thing, which is why it is safe for them to run
 * back to back on the commit that resolves the click.
 */
function NavPending({
  href,
  report,
}: {
  href: string;
  report: (href: string, pending: boolean) => void;
}) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    report(href, pending);
    return () => report(href, false);
  }, [href, pending, report]);

  return null;
}
