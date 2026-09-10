"use client";

import { Button } from "@/components/ui/button";

/**
 * Invite, and then the reason it would not go, in the width the button was in.
 *
 * Both are in the row the whole time and one of them is always at nothing: two
 * grid columns going 1fr to 0fr and 0fr to 1fr, which is the one way of moving
 * between two content widths that a browser will interpolate rather than jump.
 * The reason is usually wider than the button, so the swap moves the handle
 * beside it too — done in one motion that is easy to follow, where the jump
 * read as the row being replaced.
 *
 * Each column holds its content at `w-max` behind `overflow-hidden`, so the
 * words being put away keep their shape on the way out instead of reflowing
 * narrower and narrower as the column closes.
 *
 * Nothing here checks `prefers-reduced-motion`: the blanket rule at the foot of
 * `globals.css` cuts the duration to nothing and the swap is simply instant,
 * which is the honest still version of it.
 */
export function InviteCell({
  refused,
  onInvite,
}: {
  refused?: string;
  onInvite: () => void;
}) {
  const off = refused !== undefined;

  return (
    <span
      className="grid items-center transition-[grid-template-columns] duration-300 ease-out"
      style={{ gridTemplateColumns: off ? "0fr 1fr" : "1fr 0fr" }}
    >
      {/* `inert` rather than unmounted: a button at no width is still a button
          to a keyboard, and tabbing to one nobody can see is worse than the
          jump this is avoiding. */}
      <span className="min-w-0 overflow-hidden">
        <Button size="sm" inert={off} onClick={onInvite} className="w-max">
          Invite
        </Button>
      </span>

      <span className="min-w-0 overflow-hidden">
        <span
          role="status"
          className="block w-max px-1 text-[0.75rem] whitespace-nowrap text-destructive"
        >
          {refused ?? ""}
        </span>
      </span>
    </span>
  );
}
