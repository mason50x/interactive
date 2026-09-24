"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { RailButton } from "@/components/app/rail/rail-button";
import { RailConstellation } from "@/components/app/rail-constellation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LogoMark } from "@/components/wordmark";
import {
  currentRelease,
  releases,
  releaseSeenVersion,
  versionLabel,
  type Release,
} from "@/lib/releases";
import { cn } from "@/lib/utils";

/**
 * Important releases start a new read state. Minor updates reuse the previous
 * important release's key, preserving both read and unread states, even when
 * several updates were skipped. Cleanup keeps that shared key intact.
 */
const SEEN_PREFIX = "release-seen:";
const seenKey = SEEN_PREFIX + releaseSeenVersion(releases);

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    removeEventListener("storage", listener);
  };
}

function readSeen() {
  try {
    return localStorage.getItem(seenKey) !== null;
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(seenKey, "1");
  } catch {}
  for (const listener of listeners) listener();
}

function forgetOldReleases() {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(SEEN_PREFIX) && key !== seenKey) stale.push(key);
    }
    for (const key of stale) localStorage.removeItem(key);
  } catch {}
}

/**
 * The version, in the rail.
 *
 * This is what the announcements card became. That was a feed — posts,
 * receipts, a "Read" fold, a cron to keep it to three — for a product that
 * only ever had one thing to say at a time: what the latest release did.
 * So it is now the version number, and behind it is one post, the release's
 * notes, kept in `src/lib/releases.ts` beside the code they describe.
 * Pressing the number opens the post in a sheet.
 *
 * It used to be a card of its own above the account row, as tall as the
 * playtime card beside it. Two display-size cards stacked over the account
 * row pushed the nav list into a scroll on any laptop-height window, so the
 * number now rides in the account row itself: `inline` sits on the name's
 * line in the wide rail, and `rail` is the narrow rail's square. Each is
 * hidden at the other width, so the two are never on screen together.
 *
 * Nothing is tracked on the server. The release's shared read state is a
 * key in `localStorage`, read through `useSyncExternalStore` so the
 * server and the hydrating client agree on "opened" and the unread state is
 * only ever added after hydration, never taken away. Until it is opened, the
 * number shimmers and carries a dot. A different browser will show it again,
 * and that is fine: it is a nudge, not a record.
 */
export function VersionCard({
  variant,
  className,
}: {
  variant: "inline" | "rail";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const seen = useSyncExternalStore(subscribe, readSeen, () => true);

  useEffect(forgetOldReleases, []);

  function show() {
    setOpen(true);
    markSeen();
  }

  const label = versionLabel(currentRelease.version);
  const ariaLabel = `${label}: ${currentRelease.title}. See what's new`;

  return (
    <>
      {variant === "rail" ? (
        /* The narrow rail: the number alone, the same 44px hit as the icons
           above it. Text rather than an icon because there is no glyph for
           "version" that would not have to be learned, and the number is
           shorter than any of them. */
        <RailButton
          onClick={show}
          aria-label={ariaLabel}
          className={cn(
            "relative text-[0.75rem] font-medium tabular-nums",
            className,
          )}
        >
          {label}
          {!seen && (
            <span className="absolute top-2.5 right-3 size-1.5 rounded-full bg-primary" />
          )}
        </RailButton>
      ) : (
        /* The wide rail: a quiet label on the account name's line. Unread, it
           shimmers and carries the brand dot in its corner — laid over it,
           not beside it, so the label is the same width either way and the
           name's padding in `UserMenu` holds for both. */
        <button
          type="button"
          onClick={show}
          aria-label={ariaLabel}
          className={cn(
            "hidden cursor-pointer rounded-md px-1.5 py-1 text-[0.75rem] leading-none font-medium text-faint tabular-nums outline-none rail-wide hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 wide:inline-flex",
            className,
          )}
        >
          <span className={cn(!seen && "text-shimmer")}>{label}</span>
          {!seen && (
            <span className="absolute top-0 right-0 flex size-1.5 text-primary">
              <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-70 [animation-duration:2.4s]" />
              <span className="relative size-1.5 rounded-full bg-current" />
            </span>
          )}
        </button>
      )}

      {/* One post, not a list: the notes for the release the card names. */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[22rem] max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden"
        >
          {open && <ReleaseSheet release={currentRelease} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * The template every release is shown in.
 *
 * Top to bottom: the version, at display size; the post's title
 * in a line under it; a squiggle drawn across the panel as the sheet
 * arrives; the post; and the mark, centred, after the last of it. The
 * constellation sits at the foot of the panel behind everything.
 *
 * The column scrolls, the panel does not: the field is pinned to the panel
 * and a long post scrolls over it, and the mark travels with the post —
 * `mt-auto` puts it at the bottom of a short one and after the end of a
 * long one, so it is always the last thing read and never a thing to
 * scroll past.
 */
function ReleaseSheet({ release }: { release: Release }) {
  const label = versionLabel(release.version);
  return (
    <>
      {/* The rail's field, thinning out as it climbs: the lower half of the
          panel is its own box for the canvas to measure, and the mask on
          that box is what does the fade. The mask sits on the wrapper rather
          than on the canvas because the canvas is dirty every frame and
          would rather not be an intermediate texture — see
          `RailConstellation` — but a box this size in a panel with no
          backdrop filters over it costs nothing you can see. `isolate` keeps
          the canvas's `-z-10` inside the box and above the panel's ground. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 isolate h-1/2 overflow-hidden rounded-b-2xl [mask-image:linear-gradient(to_top,black_0%,rgba(0,0,0,0.55)_40%,transparent_100%)]"
      >
        <RailConstellation />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-0">
          <SheetTitle className="text-[2.5rem] leading-none font-semibold tabular-nums">
            {label}
          </SheetTitle>
          <SheetDescription className="mt-1 text-[0.8125rem]">
            {release.title}
          </SheetDescription>
        </SheetHeader>
        <Squiggle />

        <article className="flex flex-col gap-3 px-5 pt-4 text-[0.875rem] leading-relaxed text-foreground/85">
          {release.body.split(/\n{2,}/).map((block, index) => {
            const lines = block.split("\n");
            return lines.every((line) => line.startsWith("- ")) ? (
              <ul key={index} className="flex list-disc flex-col gap-1.5 pl-5">
                {lines.map((line, item) => (
                  <li key={item}>{line.slice(2)}</li>
                ))}
              </ul>
            ) : (
              <p key={index}>{block}</p>
            );
          })}
        </article>

        <div className="mt-auto flex justify-center pt-10 pb-8 text-foreground/70">
          <LogoMark className="h-7 w-auto" />
        </div>
      </div>
    </>
  );
}

/** Thirty waves, one per 16px: 480px of line, more than the panel can be. */
const SQUIGGLE = "M0 6 q8 -5 16 0" + " t16 0".repeat(29);

/**
 * A wavy rule the full width of the sheet, drawn left to right on entry.
 *
 * The drawing is wider than any width the panel can have and is cropped at
 * the right edge (`xMinYMid slice`) rather than stretched to fit: a wave is
 * periodic, so where it is cut does not show, and not scaling is what keeps
 * the stroke weight and the dash arithmetic honest. `pathLength="1"` makes
 * `.squiggle-draw`'s dash independent of the path's real length; the part
 * past the edge is drawn too, just not seen, so the visible line finishes
 * a little before the animation does.
 */
function Squiggle() {
  return (
    <svg
      aria-hidden
      className="mt-3 block h-3 w-full text-foreground/40"
      viewBox="0 0 480 12"
      preserveAspectRatio="xMinYMid slice"
      fill="none"
    >
      <path
        className="squiggle-draw"
        d={SQUIGGLE}
        pathLength="1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
