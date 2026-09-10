"use client";

import { type RefObject, useEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useRail } from "@/components/app/rail-context";

/**
 * The one shortcut this app has, and what to call it.
 *
 * A search you have to find with the mouse is a search nobody uses from the
 * middle of a page, and the two chords are the two every palette on the web
 * answers to. Both work everywhere; the hook that names one is only about
 * printing the chord the reader actually has.
 */

/**
 * Focuses `inputRef` on ⌘K or Ctrl+K, opening a collapsed rail first.
 *
 * The panic key is recorded separately and may be anything; if somebody
 * chose this one, its handler replaces the whole page and wins outright —
 * which is the right outcome for a key whose entire purpose is winning.
 *
 * A collapsed rail has no box to focus, so the shortcut opens it first. The
 * box is in the layout on the same frame `data-rail` changes — `display`
 * flips at once and only the opacity waits, see `rail-wide` in
 * `globals.css` — so the only thing between this handler and a focusable
 * field is React committing the state, and `flushSync` is what makes that
 * happen here rather than after the handler returns. Below `lg` the box is
 * hidden by the viewport and the focus goes nowhere, as it always has.
 */
export function useSearchShortcut(
  inputRef: RefObject<HTMLInputElement | null>,
) {
  const { rail, setRail } = useRail();

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (rail === "closed") flushSync(() => setRail("open"));
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [rail, setRail, inputRef]);
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
