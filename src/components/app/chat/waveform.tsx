"use client";

import { useCallback, useRef } from "react";

import { useStillness } from "@/lib/motion";
import { useMicLevel } from "@/lib/use-mic-level";

/**
 * Five bars that move with the microphone, in place of the icon while the
 * composer is listening.
 *
 * The bars are plain spans and the levels are written straight to their
 * transforms from the animation loop in `useMicLevel`; React renders this
 * once and is not told about a single frame after that. There is no CSS
 * transition on the bars because it would fight the loop.
 *
 * Under reduced motion the loop never starts and the bars sit at one still
 * mid height — a picture of listening rather than a performance of it.
 *
 * Purely decorative: the button that holds it carries the label.
 */

const BARS = 5;
/** Band per bar, centre-out, so the loud low band sits in the middle. */
const ORDER = [3, 1, 0, 2, 4];
/** Visible in silence. */
const FLOOR = 0.18;
/** The one height under reduced motion. */
const REST = 0.55;

export function Waveform() {
  const still = useStillness();
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  const onFrame = useCallback((levels: Float32Array) => {
    for (let i = 0; i < BARS; i++) {
      const bar = bars.current[i];
      if (bar === null || bar === undefined) continue;
      bar.style.transform = `scaleY(${FLOOR + (1 - FLOOR) * levels[ORDER[i]]})`;
    }
  }, []);

  useMicLevel({ active: !still, bands: BARS, onFrame });

  return (
    <span aria-hidden className="flex h-4 items-center gap-[3px]">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(node) => {
            bars.current[i] = node;
          }}
          className="h-full w-0.5 origin-center rounded-full bg-current"
          style={{ transform: `scaleY(${still ? REST : FLOOR})` }}
        />
      ))}
    </span>
  );
}
