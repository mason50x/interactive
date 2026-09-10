"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The composer's box and its twin.
 *
 * A textarea cannot animate to `auto`, and asking it for its own
 * `scrollHeight` means first snapping it to `auto` to measure — which is
 * the jump this exists to remove. So the same text is laid out in an
 * invisible div with the same width, padding and type, that div's height
 * is the answer, and the textarea is told it as a number it can move to.
 * A `ResizeObserver` on the twin catches both a new line of text and a
 * narrower window, which are the two things that change how it wraps.
 *
 * The third ref is the coloured copy of the text drawn under the field —
 * see the render in `Composer` — which has to scroll wherever the field
 * scrolls. It follows on the field's own scroll event and, because a
 * programmatic scroll fires no event, again before paint whenever the text
 * changes.
 */

/**
 * How tall the box may be, in pixels: one line with its padding, and the
 * same eight lines `max-h-32` used to allow before the height was measured.
 * Past the ceiling the box scrolls, as it always did.
 */
const FIELD_MIN = 36;
const FIELD_MAX = 128;

export function useAutogrow(shown: string) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(FIELD_MIN);

  function syncBackdrop() {
    if (backdrop.current !== null && fieldRef.current !== null) {
      backdrop.current.scrollTop = fieldRef.current.scrollTop;
    }
  }

  // The copy under the field follows it wherever the text moved it — a
  // programmatic scroll fires no event the handler would see.
  useLayoutEffect(syncBackdrop, [shown]);

  useEffect(() => {
    const el = mirror.current;
    if (el === null) return;
    const observer = new ResizeObserver(() => {
      setHeight(Math.min(FIELD_MAX, Math.max(FIELD_MIN, el.offsetHeight)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { fieldRef, mirror, backdrop, height, syncBackdrop };
}
