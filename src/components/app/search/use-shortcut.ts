"use client";

import { type RefObject, useEffect, useSyncExternalStore } from "react";

/**
 * The one shortcut this app has, and what to call it.
 *
 * A search you have to find with the mouse is a search nobody uses from the
 * middle of a page, and the two chords are the two every palette on the web
 * answers to. Both work everywhere; the hook that names one is only about
 * printing the chord the reader actually has.
 */

/** Focuses the desktop search input on ⌘K or Ctrl+K. */
export function useSearchShortcut(
  inputRef: RefObject<HTMLInputElement | null>,
) {
  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [inputRef]);
}

// Nothing to subscribe to: the platform does not change under a running page.
const subscribe = () => () => {};
const chordHere = () => (navigator.userAgent.includes("Mac") ? "⌘K" : "Ctrl K");
// The server has no `navigator` and renders the Mac spelling; hydrating
// against anything else would be a mismatch on an 11px key cap.
const chordOnServer = () => "⌘K";

/**
 * Which chord to print in the hint.
 *
 * `useSyncExternalStore` rather than state set from an effect: React renders
 * the server snapshot, hydrates against it, and then swaps in the client one,
 * which is exactly the sequence wanted — the correction lands before anybody
 * has read the cap, without a second render React has to be told to expect.
 */
export function useShortcutChord() {
  return useSyncExternalStore(subscribe, chordHere, chordOnServer);
}
