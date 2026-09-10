"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChat } from "@/components/app/chat/chat-provider";
import { VersionCard } from "@/components/app/version-card";
import { InviteCard } from "@/components/app/invite-card";
import { RailConstellation } from "@/components/app/rail-constellation";
import { RailContext } from "@/components/app/rail-context";
import { RailLockup } from "@/components/app/rail/rail-lockup";
import { RailToggle } from "@/components/app/rail/rail-toggle";
import { useActivePill } from "@/components/app/rail/use-active-pill";
import {
  NavPending,
  useNavPending,
} from "@/components/app/rail/use-nav-pending";
import { useRailState } from "@/components/app/rail/use-rail-state";
import { usePreferences } from "@/components/preferences-provider";
import { RailSearch } from "@/components/app/rail-search";
import { UserMenu } from "@/components/app/user-menu";
import { NAV_HREFS, PHILOSOPHY_HREF, navItems } from "@/lib/nav";
import type { RailState } from "@/lib/rail";
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
  const { hasUnread, mentioned } = useChat();

  const { rail, moved, railContext } = useRailState(initialRail);
  const { pendingHref, report } = useNavPending();
  const { activeHref, litHref, list, pill } = useActivePill(
    pathname,
    pendingHref,
  );

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
  const viewing =
    /^\/dashboard\/activities\/[^/]+/.test(pathname) ||
    pathname === PHILOSOPHY_HREF;

  const warm = useWarmRoutes(NAV_HREFS, pathname);

  return (
    <RailContext value={railContext}>
      <nav
        aria-label="Dashboard"
        data-rail={rail}
        data-rail-moved={moved ? "" : undefined}
        className="relative isolate z-30 flex w-[4.5rem] shrink-0 flex-col transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:w-60"
      >
        {preferences.constellation && <RailConstellation quiet={viewing} />}

        <RailLockup warm={warm} />

        {/* The way back. Below `lg` there is no wide rail to open, so this is
            the one place the two narrow cases part: it exists in the collapsed
            one only. A row of its own rather than a hover state on the mark,
            because a control that only appears when the pointer happens to be
            over the thing it replaced is a control that has to be discovered. */}
        <div className="hidden pb-2 pl-3 rail-narrow collapsed:block">
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
            const { solid: Solid } = item.icon;

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
                    "group nav-row relative flex h-11 items-center gap-3 overflow-hidden rounded-lg border border-transparent px-3 text-[0.9375rem] font-medium whitespace-nowrap",
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
                  {/* Solid in every state. The rail once traded outline for
                    solid on the lit row; now the glyph never changes shape,
                    so only the colour switch above has to be timed. The
                    margin is what centres the icon in the narrow rail —
                    padding plus margin plus half the icon lands on the middle
                    of the 60px row — and eases to nothing as the labels
                    arrive, so the icon slides its 8px rather than hopping. */}
                  <Solid className="ml-2 size-5 shrink-0 transition-[margin] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:ml-0" />
                  {/* An unread row's label glints now and then in the brand
                    colour — a pass, not a loop, so it can be noticed without
                    having to be watched. Not on the lit row, which is already
                    where it points. The base is the row's own ink, and it
                    follows the hover through `group-hover` because the word
                    is painted by the gradient and no longer by `color`. */}
                  <span
                    className={cn(
                      "opacity-0 transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:opacity-100",
                      item.unread &&
                        hasUnread &&
                        !lit &&
                        "text-shimmer-periodic [--shimmer-base:var(--muted-foreground)] group-hover:[--shimmer-base:var(--foreground)]",
                    )}
                  >
                    {item.label}
                  </span>

                  {/* A dot and a word, never a number. The rail is a list of
                    places, and a count on it would be a second thing to read
                    on a row whose whole job is to be recognised at a glance —
                    the conversation list is where "how many, and from whom"
                    belongs. Any new message lights it, the room's included;
                    the word changes when one of them names you.

                    Anchored to the row's right edge, dot outermost, so the
                    word can fade with the label in the icon rail and leave the
                    dot where it was. There it tucks into the top corner beside
                    the icon, since the row is 60px and a dot on the icon's own
                    centreline would read as part of the glyph; with labels it
                    sits on the label's line. Absolutely positioned either way
                    so the row never changes shape between the two widths.

                    Not on the lit row: you are already where it points, and
                    the glint on the label goes for the same reason. */}
                  {item.unread && hasUnread && !lit ? (
                    <span
                      aria-label={
                        mentioned ? "You were mentioned" : "Unread messages"
                      }
                      role="status"
                      className="absolute top-2.5 right-2 flex items-center gap-1.5 text-primary [transition:top_300ms_cubic-bezier(0.32,0.72,0,1),right_300ms_cubic-bezier(0.32,0.72,0,1),translate_300ms_cubic-bezier(0.32,0.72,0,1)] wide:top-1/2 wide:right-3 wide:-translate-y-1/2"
                    >
                      <span className="text-xs leading-none font-medium opacity-0 transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:opacity-100">
                        {mentioned ? "Mentioned" : "Unread"}
                      </span>
                      {/* The ring is Tailwind's ping slowed to the beat the
                        chat header's presence dot uses: at this size the stock
                        second reads as an alarm. The blanket reduced-motion
                        rule at the foot of `globals.css` stills it. */}
                      <span className="relative flex size-2 shrink-0">
                        <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-70 [animation-duration:2.4s]" />
                        <span className="relative size-2 rounded-full bg-current" />
                      </span>
                    </span>
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
        <VersionCard />
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
