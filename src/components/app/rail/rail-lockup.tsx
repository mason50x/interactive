"use client";

import Link from "next/link";
import { RailToggle } from "@/components/app/rail/rail-toggle";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import type { useWarmRoutes } from "@/lib/warm";

/**
 * The head of the rail: the mark, the name beside it, and the control that
 * puts the rail away.
 *
 * Also the only route back to `/dashboard` itself: the overview has no row of
 * its own in the list.
 *
 * One lockup at both widths, not two. The mark is sized in `em`, so easing
 * the font size is what carries it between the icon rail's larger cut and
 * the labelled rail's smaller one, and the name is swapped out from beside it
 * rather than the whole thing replaced. The padding eases too: it is what
 * centres the mark over the icon column at one width and puts it on the
 * labels' left edge at the other. `overflow-hidden` is for the name on the
 * way out — it is wider than the rail it is leaving.
 *
 * The narrow padding is the icon column's centre less half the mark: the rows
 * below are 60px wide behind a 12px inset, so their icons sit on the 42px
 * line, and the mark at 1.375rem is 17.6px wide. Change the mark's size or
 * the rail's width and this moves.
 *
 * `warm` is the rail's, handed down rather than made here, so the overview is
 * warmed by the same pass and the same memory as every row below it.
 */
export function RailLockup({
  warm,
}: {
  warm: ReturnType<typeof useWarmRoutes>;
}) {
  return (
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
        className="ml-auto hidden size-9 rounded-lg rail-wide wide:flex"
      />
    </div>
  );
}
