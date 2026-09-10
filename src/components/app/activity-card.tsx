"use client";

import Link from "next/link";
import { useState } from "react";
import { type Activity, popularityLabel, thumbnailSrc } from "@/lib/activity";
import { GENRES } from "@/lib/genres";
import { cn } from "@/lib/utils";

/**
 * One activity, as a 16:9 tile with its text over the art.
 *
 * The art fills the frame, and for most of the catalogue it now fits it. 179
 * of the 318 carry a 960x540 thumbnail cut to this exact ratio, so
 * `object-cover` scales and nothing is cropped away.
 *
 * The rest still carry upstream's 480x100 strip — a 4.8:1 letterbox against a
 * 1.78:1 frame — and for those `object-cover` scales to the frame's height and
 * takes the middle. The crop is centred because there is nothing better to go
 * on: those are arbitrary screen grabs rather than logos, with no focal point
 * recorded anywhere. It shows a smaller part of the art at a useful size
 * rather than all of it at a useless one, which is the same trade as before —
 * it just applies to 139 tiles now instead of all of them.
 *
 * Nothing here carries `will-change` or `transform-gpu`, and that is the
 * point. Both are promotion hints: they hand the element a compositor layer
 * of its own and hold it there for as long as the declaration applies. On one
 * element under the pointer that is the right trade, which is what
 * `.popup-slide` in `globals.css` does and why its comment is careful to say
 * the hint "never outlives the motion it is for". This card is the opposite
 * case. The browser renders every one of the 318 in the catalogue at once —
 * the shelves are not virtualised, and lazy images still leave the elements in
 * the tree — so a hint on four of its nodes was asking for roughly 1,200
 * permanently-resident GPU layers on `/dashboard/activities`, for hovers that
 * happen one at a time. Past its layer budget the compositor starts evicting
 * and re-rasterising, and the page spends the whole session doing it.
 *
 * The transitions are unchanged. `transform` and `opacity` are composited
 * anyway once they are actually animating; the hint only decides whether the
 * layer is created now or on the first frame of the hover, and for one card at
 * a time the browser can afford to decide that itself.
 */
export function ActivityCard({
  activity,
  /**
   * The line revealed under the title on hover, when the caller knows
   * something more useful than the catalogue rank — "opened 11 times", "2
   * hours ago", "6 views today". Left off, the rank is what there is.
   */
  note,
}: {
  activity: Activity;
  note?: string;
}) {
  // A handful of upstream tiles point at art that is not in the repo, and one
  // broken-image glyph in a row of tiles is louder than a plain colour block.
  const [artFailed, setArtFailed] = useState(false);

  const art = artFailed ? null : thumbnailSrc(activity);
  const meta = GENRES[activity.genre];

  const hue = { "--hue": meta.hue } as React.CSSProperties;

  const shell = cn(
    "group relative block aspect-video w-full overflow-hidden rounded-xl",
    "border border-border bg-surface-muted",
    "transition-[box-shadow] duration-300",
    "hover:shadow-lg",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  );

  const face = (
    <>
      {art ? (
        /* Deliberately not `next/image`. The art is already WebP at the size
           the tile draws it, so routing 318 tiles through the optimiser would
           bill a transformation each against a quota of 5,000 a month to make
           them no smaller. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={art}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setArtFailed(true)}
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "color-mix(in oklab, var(--hue) 22%, var(--surface-muted))",
          }}
        />
      )}

      {/*
       * The scrim, as two fixed gradients cross-fading rather than one
       * gradient whose stops move.
       *
       * A `transition-colors` between two gradients cannot be composited — the
       * browser re-rasterises a card-sized layer on every frame of every card
       * under the pointer, which is what turns this hover into a slideshow.
       * Opacity is a compositor property, so the same visual change costs
       * nothing per frame.
       */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" />

      <div className="absolute inset-x-0 bottom-0 p-3.5 pb-9">
        {/*
         * The plate does not move. The line below it is revealed into space
         * this padding already holds open, rather than by lifting the title
         * out of the way — the title is truncated at either height, so the
         * motion bought nothing and cost a moving target to read.
         */}
        <div className="flex items-center gap-1.5">
          <meta.icon
            className="size-3.5 shrink-0"
            style={{ color: "color-mix(in oklab, var(--hue) 70%, white)" }}
          />
          <span className="label-small text-white/75">{meta.label}</span>
        </div>

        <p className="mt-1 truncate text-[0.9375rem] font-medium text-white">
          {activity.title}
        </p>

        {/* Sits in the space the plate's bottom padding keeps for it, so
            revealing it is opacity and nothing else. */}
        <p className="label-small absolute inset-x-3.5 bottom-3.5 translate-y-1 truncate text-white/65 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          {note ?? popularityLabel(activity)}
        </p>
      </div>
    </>
  );

  return (
    <Link
      href={`/dashboard/activities/${activity.slug}`}
      style={hue}
      className={shell}
    >
      {face}
    </Link>
  );
}
