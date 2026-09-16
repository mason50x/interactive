"use client";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { Icon as IconType } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Shared 16:9 artwork tile for games and TV. */
export function CatalogueCard({
  title,
  href,
  thumbnail,
  category,
  hueColor,
  icon: Icon,
  note,
}: {
  title: string;
  href: string;
  thumbnail: string;
  category: string;
  hueColor: string;
  icon: IconType;
  note?: string;
}) {
  // A handful of upstream tiles point at art that is not in the repo, and one
  // broken-image glyph in a row of tiles is louder than a plain colour block.
  const [artFailed, setArtFailed] = useState(false);

  const art = artFailed ? null : thumbnail;

  const hue = { "--hue": hueColor } as CSSProperties;

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
          <Icon
            className="size-3.5 shrink-0"
            style={{ color: "color-mix(in oklab, var(--hue) 70%, white)" }}
          />
          <span className="text-xs text-white/75">{category}</span>
        </div>

        <p className="mt-1 truncate text-[0.9375rem] font-medium text-white">
          {title}
        </p>

        {/* Sits in the space the plate's bottom padding keeps for it, so
            revealing it is opacity and nothing else. */}
        <p className="absolute inset-x-3.5 bottom-3.5 translate-y-1 truncate text-xs text-white/65 opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          {note}
        </p>
      </div>
    </>
  );

  return (
    <Link href={href} prefetch={false} style={hue} className={shell}>
      {face}
    </Link>
  );
}
