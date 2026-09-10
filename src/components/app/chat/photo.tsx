import type { ComponentProps } from "react";

/**
 * A picture somebody sent, drawn as a plain `<img>`.
 *
 * Deliberately not `next/image`, and this is the one place the project says
 * so. The optimiser would route every chat picture through Vercel's image
 * transformation, which is billed per source image — the exact cost the
 * whole upload path is arranged to avoid, see `convex/moderation/images.ts`.
 * The pictures are already shrunk before they are stored (`src/lib/images.ts`),
 * they come from a Convex storage URL that changes with every deployment
 * and so would need a `remotePatterns` entry to keep in step, and half the
 * time the `src` here is a blob URL for a preview the optimiser could not
 * fetch at all. A plain element does the right thing in every one of those
 * cases and costs nothing.
 *
 * `alt` is empty on purpose everywhere this is used: the picture is the
 * message and there is no text that describes it, so a screen reader is
 * better served by the surrounding "sent a picture" than by a filename.
 */
export function Photo({ alt = "", ...props }: ComponentProps<"img">) {
  // eslint-disable-next-line @next/next/no-img-element -- see the note above
  return <img alt={alt} decoding="async" {...props} />;
}
