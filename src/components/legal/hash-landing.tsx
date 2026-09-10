"use client";

import { useEffect } from "react";

/**
 * Makes a link to a clause actually land on it.
 *
 * The root layout sets `scroll-smooth` on `<html>`, which the marketing page
 * needs for its in-page nav. The side effect is that the browser's own jump
 * to a `#fragment` on first load becomes an *animation* — and an animation
 * that is still running when React hydrates gets cancelled by it, leaving the
 * reader at the top of a document they were linked into the middle of.
 *
 * So the jump is done again here, once, after hydration, and instantly:
 * setting the scroll position outright both cancels the interrupted animation
 * and is the right behaviour anyway. Gliding six thousand pixels to reach
 * clause 12 is not a transition anyone asked to watch.
 *
 * Only the first load needs this. Clicking a fragment on a page already open
 * is an ordinary same-document navigation, which nothing interrupts.
 */
export function HashLanding() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;

    const target = document.getElementById(id);
    if (!target) return;

    // After the frame hydration paints in, otherwise this is the scroll that
    // gets undone rather than the one that sticks.
    const frame = requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "instant", block: "start" });
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  return null;
}
