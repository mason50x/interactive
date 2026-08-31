"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { AgreementCard } from "@/components/app/agreement-card";
import { InviteCard } from "@/components/app/invite-card";
import { RailConstellation } from "@/components/app/rail-constellation";
import { usePreferences } from "@/components/preferences-provider";
import { RailSearch } from "@/components/app/rail-search";
import { UserMenu } from "@/components/app/user-menu";
import { navItems } from "@/lib/nav";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

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
 * bar and no state is needed to open or close it.
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
export function AppSidebar() {
  const pathname = usePathname();
  const { preferences } = usePreferences();
  const list = useRef<HTMLUListElement>(null);
  const [pill, setPill] = useState<{ top: number; height: number } | null>(
    null,
  );

  // Exactly one item is lit: the one whose href is the *longest* prefix of the
  // current path. Testing each item on its own would light every ancestor too,
  // and since every route here sits under `/dashboard`, an item pointing at
  // the root would be lit on every page of the app.
  // An activity is running in a frame beside this rail, and an activity is the most
  // expensive thing this app ever puts on a screen. The constellation is
  // decoration; it comes off while the machine has real work to do, and comes
  // back the moment you leave the activity. Every other route keeps it.
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
    const row = list.current?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    setPill(row ? { top: row.offsetTop, height: row.offsetHeight } : null);
  }, [activeHref]);

  return (
    <nav
      aria-label="Dashboard"
      className="relative isolate z-30 flex w-[4.5rem] shrink-0 flex-col lg:w-60"
    >
      {preferences.constellation && !viewing && <RailConstellation />}

      {/* Also the only route back to `/dashboard` itself: the overview has no
          row of its own in the list. */}
      <div className="flex h-16 items-center justify-center pl-3 lg:justify-start lg:pl-5">
        <Link
          href="/dashboard"
          aria-label={`${brand.name} dashboard`}
          className="rounded-full backdrop-blur-[3px] transition-opacity hover:opacity-70"
        >
          <span className="lg:hidden">
            <Wordmark showName={false} className="text-[1.375rem]" />
          </span>
          <span className="hidden lg:block">
            <Wordmark short />
          </span>
        </Link>
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
          const { outline: Outline, solid: Solid } = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // Positioned so it paints above the pill, and bordered on the
                  // base — transparent — so the label sits at the same inset
                  // whether or not the pill is under it.
                  "relative flex h-11 items-center justify-center gap-3 rounded-lg border border-transparent text-[0.9375rem] font-medium lg:justify-start lg:px-3",
                  // The global focus ring is a 2px outline held 2px off the
                  // element — around a row that is already filled blue it lands
                  // as a second, brighter border. These get an inset ring
                  // instead, which sits inside the face rather than orbiting it.
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                  active
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
                <span className="relative size-5 shrink-0">
                  <Outline
                    className={cn(
                      "absolute inset-0 size-5 transition-[opacity] delay-[70ms] duration-0",
                      active && "opacity-0",
                    )}
                  />
                  <Solid
                    className={cn(
                      "absolute inset-0 size-5 transition-[opacity] delay-[70ms] duration-0",
                      !active && "opacity-0",
                    )}
                  />
                </span>
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* The terms sit above the allowance because they outrank it: until they
          are accepted the catalogue is inert and nothing opens, so this is the
          one control in the rail that has to be found. See `AgreementCard`. */}
      <AgreementCard />

      {/* The allowance sits above the account button rather than inside its
          menu: it is the one thing in this chrome that moves on its own, and
          a number you have to open a popup to read is a number nobody reads.
          See `InviteCard`. */}
      <InviteCard />

      {/* Nothing links back to the marketing site: `/` bounces a live session
          straight back here, so it would be a round trip to nowhere. */}
      <div className="shrink-0 pb-3 pl-3">
        <UserMenu />
      </div>
    </nav>
  );
}
