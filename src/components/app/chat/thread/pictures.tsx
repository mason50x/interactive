"use client";

import { useState, type CSSProperties } from "react";
import { Photo } from "@/components/app/chat/photo";
import { Lightbox, sourceOf } from "@/components/app/chat/thread/lightbox";
import { cn } from "@/lib/utils";
import type { ChatImage } from "../../../../../convex/chat/messages";

/**
 * The pictures on a message.
 *
 * One is drawn at its own shape, capped in both directions so a tall photo
 * does not take the pane and a wide one does not take the column. Two to
 * four are a grid of squares, cropped — a grid of mixed shapes is a ransom
 * note, and the whole picture is one press away.
 *
 * The `width` and `height` attributes are what let the browser draw the box
 * before the bytes arrive, which is what keeps a thread from jumping as it
 * loads; they came up with the upload for exactly this.
 */
export function Pictures({ images }: { images: ChatImage[] }) {
  const [open, setOpen] = useState<ChatImage | null>(null);
  const single = images.length === 1;

  return (
    <>
      <div
        className={cn(
          "grid gap-1 overflow-hidden rounded-3xl",
          single ? "grid-cols-1" : "w-64 max-w-full grid-cols-2",
        )}
      >
        {images.map((image) => (
          <button
            key={image.attachmentId}
            type="button"
            onClick={() => setOpen(image)}
            aria-label="Open picture"
            // The box is sized here, on the button, and the picture fills it.
            // Letting the picture size itself and the box wrap it looked
            // right until the picture was capped in height: the box kept the
            // width the uncapped picture would have had, and drew its grey
            // and its corners out past the edge of what was in it.
            style={single ? singleBox(image) : undefined}
            className={cn(
              "block cursor-zoom-in overflow-hidden bg-surface-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
              !single && "aspect-square",
            )}
          >
            <Photo
              src={sourceOf(image)}
              width={image.width}
              height={image.height}
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>

      {open === null ? null : (
        <Lightbox image={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/** The longest either side of a lone picture may be, in pixels. */
const SINGLE_EDGE = 320;

/**
 * The box for a picture on its own.
 *
 * Its own shape, no larger than `SINGLE_EDGE` on either side, and never
 * larger than the picture itself — a sixty-pixel sticker is not blown up to
 * a poster. `min(100%, …)` is the column: on a narrow screen the column is
 * narrower than the cap, and the box follows it. The height comes from the
 * aspect ratio, so the width is the only number that needs deciding.
 */
function singleBox(image: ChatImage): CSSProperties {
  const ratio = image.width / image.height;
  const width = Math.round(
    Math.min(image.width, SINGLE_EDGE, SINGLE_EDGE * ratio),
  );
  return {
    aspectRatio: `${image.width} / ${image.height}`,
    width: `min(100%, ${width}px)`,
  };
}
