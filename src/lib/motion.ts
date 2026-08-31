import { useSyncExternalStore } from "react";

/**
 * Whether the reader has asked for less movement, as a value a component can
 * branch on.
 *
 * Most of this app answers that question in CSS, where the blanket rule at the
 * foot of `globals.css` collapses every animation and transition to an instant
 * without anything in JavaScript knowing. This is for the two cases that rule
 * cannot reach: a `requestAnimationFrame` loop, which CSS has no opinion about,
 * and a WebGL canvas, which is not slower when it is still — it is a shader
 * asking the GPU for sixty identical frames a second. Both have to be *not
 * started*, and only the component can do that.
 *
 * A media query is an external store and is read as one, which is the shortest
 * way to be right on the first client paint and still hear about a change made
 * mid-session. The server is told `false`, because the server has no reader to
 * ask.
 */
const STILL_QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(STILL_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useStillness() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(STILL_QUERY).matches,
    () => false,
  );
}
