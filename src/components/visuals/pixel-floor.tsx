"use client";

import dynamic from "next/dynamic";
import { usePreferences } from "@/components/preferences-provider";
import { useStillness } from "@/lib/motion";
import { accentColor } from "@/lib/preferences";

/**
 * Loaded on demand and never on the server. It is three.js and postprocessing
 * behind that import — the heaviest thing in the app by a distance — and every
 * screen that wants it is a screen somebody passes through rather than works
 * in, so paying for it in the bundle everybody loads on every visit would be
 * the wrong way round.
 */
const PixelBlast = dynamic(
  () => import("@/components/visuals/pixel-blast").then((m) => m.PixelBlast),
  { ssr: false },
);

/**
 * The pixels along the bottom edge, on the screens that are a threshold rather
 * than a place: pick a handle, accept the terms.
 *
 * The shader fills a band rather than the screen, and the band is masked so it
 * arrives solid at the bottom and is gone well before it reaches the type. That
 * mask is doing the work `edgeFade` would otherwise do — but `edgeFade` fades
 * all four sides evenly, which puts a visible seam across the bottom of the
 * window and lightens the left and right edges of something that should run the
 * full width of it.
 *
 * The colour is the account's accent by default, read from preferences rather
 * than from the custom property they also write. The shader needs a hex to hand
 * to WebGL, and going back through `getComputedStyle` for a value we already
 * hold in JavaScript would be a round trip through the DOM to learn something
 * we know.
 *
 * Under reduced motion none of it is mounted. A shader with `speed` at zero is
 * a still image that still asks the GPU for sixty frames a second of it, and
 * the honest version of "do not animate this" is not to run the loop at all —
 * so the band becomes a wash of the same colour, which is what the pixels
 * average out to anyway.
 *
 * The caller owns the stacking. This positions itself against the nearest
 * positioned ancestor and draws nothing else, so whatever is on top of it wants
 * `relative` and this does not want a z-index.
 */
export function PixelFloor({ color }: { color?: string }) {
  const { preferences } = usePreferences();
  const still = useStillness();
  const paint = color ?? accentColor(preferences.accent);

  if (still) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%]"
        style={{
          background: `linear-gradient(to top, color-mix(in oklab, ${paint} 22%, transparent), transparent)`,
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="absolute inset-x-0 bottom-0 h-[34%]"
      style={{
        maskImage: "linear-gradient(to top, #000 0%, #000 18%, transparent 96%)",
        WebkitMaskImage:
          "linear-gradient(to top, #000 0%, #000 18%, transparent 96%)",
      }}
    >
      <PixelBlast
        variant="square"
        color={paint}
        // Thick. At the default of 3 this is a texture; at 10 it is pixels,
        // which is the only reason it is here.
        pixelSize={10}
        patternScale={3}
        patternDensity={1.15}
        pixelSizeJitter={0.4}
        speed={0.35}
        // Off, because the pixels are square and hard-edged by design and
        // there is nothing in the image for it to smooth.
        antialias={false}
        edgeFade={0}
        enableRipples
        rippleSpeed={0.28}
        rippleThickness={0.1}
        rippleIntensityScale={1.4}
      />
    </div>
  );
}
