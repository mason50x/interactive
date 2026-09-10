"use client";

import type { Hit } from "@/lib/search";
import { cn } from "@/lib/utils";

/**
 * One result.
 *
 * A `div` with `role="option"` rather than a button or a link, because it is
 * one: the field keeps focus the whole time — that is what makes the arrow
 * keys work — and a focusable control inside a listbox the user is not
 * focusing is a tab stop that goes nowhere. Navigation is `router.push` in
 * the search's `choose`, which is what a `Link` would have done.
 *
 * Highlight follows the pointer as well as the arrows, and they write to the
 * same state, so moving the mouse over the list does not leave two rows
 * looking chosen.
 *
 * Both callbacks are handed the hit rather than closed over it, so the search
 * can pass one handler to every row instead of minting a closure per row per
 * render — and so the handler that finally blurs the field is called from an
 * event, which is the only place a ref should be read.
 */
export function ResultRow({
  hit,
  active,
  onHover,
  onPick,
}: {
  hit: Hit;
  active: boolean;
  onHover: (hit: Hit) => void;
  onPick: (hit: Hit) => void;
}) {
  const Icon = hit.icon;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the listbox is driven from
    // the input's own key handler, which is what `aria-activedescendant` is
    // for; this element is never focused and so can never receive a key event.
    <div
      id={hit.id}
      role="option"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      onMouseMove={() => onHover(hit)}
      onClick={() => onPick(hit)}
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
        active && "bg-foreground/[0.05]",
      )}
    >
      <Icon
        aria-hidden
        style={hit.tint ? { color: hit.tint } : undefined}
        className={cn(
          "size-4 shrink-0",
          hit.tint ? undefined : active ? "text-foreground" : "text-faint",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] font-medium text-foreground">
          {hit.title}
        </span>
        {hit.detail ? (
          <span className="block truncate text-[0.8125rem] text-muted-foreground">
            {hit.detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}
