"use client";

import { LockClosedIcon } from "@heroicons/react/24/solid";
import Link from "next/link";
import { useState } from "react";
import { useAgreement } from "@/components/app/agreement-provider";
import { type Activity, popularityLabel, thumbnailSrc } from "@/lib/activity";
import { requestAgreement } from "@/lib/agreement";
import { GENRES } from "@/lib/genres";
import { cn } from "@/lib/utils";

/**
 * One activity, as a 16:9 tile with its text over the art.
 *
 * The art fills the frame and is cropped to do it. Every thumbnail upstream
 * ships is a 480x100 strip — a 4.8:1 letterbox against a 1.78:1 frame — so
 * `object-cover` scales it to the frame's height and takes the middle of it.
 * The alternative, showing the strip whole inside the tile, leaves two thirds
 * of the card to be filled with something that is not the activity.
 *
 * The crop is centred because there is nothing better to go on: these are
 * arbitrary screen grabs rather than logos, with no focal point recorded
 * anywhere. Regenerating `public/thumbnails` at 16:9 is what actually fixes
 * it; until then this shows a smaller part of the art at a useful size rather
 * than all of it at a useless one.
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

  /**
   * Until the terms are accepted this is not a link.
   *
   * Explicitly `=== false` rather than falsy: the context is `null` until the
   * answer is known, and locking all 318 tiles on a maybe — then unlocking
   * them — is a worse first second than letting a click through to a route
   * that refuses on the server. The dashboard layout renders the answer in, so
   * that window is normally no window at all. See `AgreementProvider` and
   * `src/lib/agreement-gate.ts` — this is the courtesy, not the gate.
   */
  const locked = useAgreement()?.agreed === false;

  const hue = { "--hue": meta.hue } as React.CSSProperties;

  const shell = cn(
    "group relative block aspect-video w-full overflow-hidden rounded-xl",
    "border border-border bg-surface-muted",
    "transition-[box-shadow] duration-300",
    // The tile does not move under the pointer — the shadow is what says it
    // will open. The locked one gets neither: it still responds, by opening
    // the agreement, but it says so with the plate over it rather than by
    // pretending.
    !locked && "hover:shadow-lg",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  );

  const face = (
    <>
      {art ? (
        /* Deliberately not `next/image`. At six kilobytes there is nothing for
           an optimiser to save, and routing 318 tiles through it would bill a
           transformation each against a quota of 5,000 a month to make them no
           smaller. */
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
          {locked ? "Agreement required" : (note ?? popularityLabel(activity))}
        </p>
      </div>
    </>
  );

  // Clicking it is not nothing, and that is the point: a dead tile leaves the
  // person to work out why on their own. This one asks the rail for the
  // agreement card, which opens with the field focused — see
  // `requestAgreement`. The label carries the reason too, because a lock glyph
  // over the art is only a reason if you can see it.
  if (locked) {
    return (
      <button
        type="button"
        onClick={requestAgreement}
        aria-label={`${activity.title} — accept the agreement to open it`}
        style={hue}
        className={cn(shell, "cursor-pointer text-left")}
      >
        {face}

        {/* Over the scrims rather than under them, so it reads on the bright
            art as well as the dark. The veil is what makes the whole tile look
            held back; the chip is what says by what. */}
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-white/85 backdrop-blur-sm">
          <LockClosedIcon className="size-3" />
          <span className="label-small">Locked</span>
        </div>
      </button>
    );
  }

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
