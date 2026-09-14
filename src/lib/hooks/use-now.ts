import { useSyncExternalStore } from "react";

/**
 * The current time, but only once the browser has it.
 *
 * `null` during server rendering and hydration, and that is the whole point.
 * Anything derived from the clock — today's date, "2 hours ago" — is a
 * different string on a server running in UTC than it is in the reader's
 * timezone, so rendering one into the HTML is a guaranteed mismatch on exactly
 * the copy people read first. Callers hold space for it and fill it in when it
 * arrives, which is the same shape they already need for the Convex
 * subscriptions beside it.
 *
 * `useSyncExternalStore` rather than a `useState` set from an effect: React
 * renders the server snapshot, hydrates against it, and *then* swaps in the
 * client one, which is precisely the sequence wanted here. An effect would
 * reach the same place by way of a second render React has to be told to
 * expect. `ActivityFrame` uses the same hook for the same reason.
 *
 * The clock is one module-level store rather than one per component, so a page
 * with four of these has one interval behind it and every consumer re-renders
 * against the same instant. The interval only exists while something is
 * subscribed.
 */

/** A minute is the finest bucket `formatSince` has, so anything faster would
 *  re-render to produce the same words. */
const TICK_MS = 60_000;

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    // The module may have been loaded long before anything asked, so the
    // stored value is caught up here rather than left at import time.
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, TICK_MS);
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Cached, not `Date.now()` — a snapshot that changed on every call would put
 *  React in a loop trying to settle on one. */
const getSnapshot = () => now;
const getServerSnapshot = () => null;

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
