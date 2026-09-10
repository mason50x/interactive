"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Fullscreen for one element, with a fallback for where the API is missing.
 *
 * The real thing is `requestFullscreen` on the target, and `fullscreen`
 * follows `fullscreenchange` so it is right whether the user left through
 * our button or through the browser's own Escape. Where the API is absent —
 * iOS Safari on an iframe's parent, notably — or where it refuses, the hook
 * falls back to `expanded`: a flag the caller turns into a fixed, viewport
 * filling box. Escape closes that fallback the way it closes the real one,
 * since the user cannot tell the two apart and should not have to.
 */
export function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const change = () =>
      setFullscreen(document.fullscreenElement === target.current);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("fullscreenchange", change);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", change);
      window.removeEventListener("keydown", escape);
    };
  }, [target]);
  async function toggle() {
    try {
      if (expanded) {
        setExpanded(false);
        return;
      }
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (target.current?.requestFullscreen)
        await target.current.requestFullscreen();
      else setExpanded((value) => !value);
    } catch {
      setExpanded((value) => !value);
    }
  }
  return { fullscreen, expanded, toggle };
}
