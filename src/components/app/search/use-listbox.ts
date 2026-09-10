"use client";

import { type KeyboardEvent, type RefObject, useState } from "react";
import type { Hit } from "@/lib/search";

/**
 * The combobox half of the rail's search: which row is highlighted, how the
 * keys move it, and what choosing a row does to the field.
 *
 * The field stays focused the whole time — that is what `aria-activedescendant`
 * is for — so every key the listbox answers to arrives through the input's own
 * handler, and every way of choosing a row, click or Enter, ends the same way:
 * the query is spent and the field is let go. Both of those live here so the
 * one place that reads the input's ref is an event handler, which is the only
 * place a ref should be read.
 */
export function useListbox({
  hits,
  open,
  query,
  setQuery,
  inputRef,
  onPick,
}: {
  hits: readonly Hit[];
  open: boolean;
  query: string;
  setQuery: (query: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  /** What a chosen hit does once the field has been dealt with. */
  onPick: (hit: Hit) => void;
}) {
  const [active, setActive] = useState(0);

  // Whatever was highlighted a keystroke ago is meaningless now — the list it
  // indexed no longer exists. Back to the top, which is also the result the
  // ranking thinks is most likely to be right.
  //
  // Keyed to the ids rather than to `hits`, so chat's answer arriving with the
  // same rows in it does not throw away a selection someone has arrowed down
  // to. Sections do not reorder, so the index stays pointing at what it did.
  //
  // Adjusted while rendering rather than in an effect: an effect would commit
  // one frame with the old index pointing into the new list before putting it
  // right, and this is the state-plus-memory shape React's own docs give the
  // render-time answer for.
  const shape = hits.map((hit) => hit.id).join(" ");
  const [seenShape, setSeenShape] = useState(shape);
  if (shape !== seenShape) {
    setSeenShape(shape);
    setActive(0);
  }

  function choose(hit: Hit) {
    // The query is spent either way. Leaving it in the box would leave the
    // panel open over the page it just took you to.
    setQuery("");
    inputRef.current?.blur();
    onPick(hit);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      // Two steps, in the order they are wanted: clear what you typed, and
      // only give up the box if there was nothing to clear.
      if (query !== "") setQuery("");
      else inputRef.current?.blur();
      return;
    }

    if (!open || hits.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // Wrapping, because a list this short has no scrollbar to tell you that
      // you have reached the end of it.
      setActive((index) => (index + step + hits.length) % hits.length);
      return;
    }

    if (event.key === "Enter") {
      const hit = hits[active];
      if (hit) {
        event.preventDefault();
        choose(hit);
      }
    }
  }

  return { active, setActive, choose, onKeyDown };
}
