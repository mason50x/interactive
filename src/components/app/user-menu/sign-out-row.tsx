"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import type { Ref } from "react";
import { SignOutIconSolid } from "@/components/app/nav-icons";
import { MenuItem } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

/** One of the two faces of the sign-out row. Both are dealt into the same grid
 *  cell so the row keeps its width and the menu never resizes mid-turn; the
 *  scale and the blur are what carry one out and the other in. `scale` is its
 *  own property in Tailwind v4, so it is named in the transition rather than
 *  covered by `transform`. */
const faceClass =
  "pointer-events-none col-start-1 row-start-1 flex origin-left items-center gap-2.5 transition-[opacity,scale,filter] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]";

/**
 * Sign out asks first, and asks in place. The confirmation is not a second
 * row or a dialog: it is the same row turned over, the label shrinking away
 * behind a blur while a filled checkbox comes forward out of one. Nothing
 * around it moves.
 *
 * The arming is the menu's state, not this row's — the menu is what has to
 * disarm it on a press elsewhere and on close — so it arrives as `confirming`
 * and the row only draws it. `closeOnClick` is that same state, which is what
 * makes the first click inert to the menu — it arms the row and no more — and
 * lets the second one close the popup on its way out.
 */
export function SignOutRow({
  ref,
  confirming,
  onClick,
}: {
  ref: Ref<HTMLDivElement>;
  confirming: boolean;
  onClick: () => void;
}) {
  return (
    <MenuItem
      ref={ref}
      tone="muted"
      size="tall"
      // Both faces are in the DOM at all times, so typeahead is told
      // which one to match on rather than being left to read the
      // hidden one too.
      label="Sign out"
      closeOnClick={confirming}
      // Armed, the row fills red with white on it and holds that
      // under the highlight: the warning is the row's own state,
      // not a hover effect, and it should not flicker back to grey
      // when the pointer leaves. Unarmed it is a row like the
      // others. The fill is transitioned on the face's clock so it
      // arrives with the words rather than a frame before them.
      className={cn(
        "transition-colors duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        confirming &&
          "bg-destructive text-destructive-foreground data-highlighted:bg-destructive data-highlighted:text-destructive-foreground",
      )}
      onClick={onClick}
    >
      <span className="grid flex-1 grid-cols-1 grid-rows-1 items-center">
        <span
          aria-hidden={confirming}
          className={cn(
            faceClass,
            confirming
              ? "scale-[0.94] opacity-0 blur-[3px]"
              : "scale-100 opacity-100 blur-[0px]",
          )}
        >
          <SignOutIconSolid className="size-4 shrink-0" />
          Sign out
        </span>
        <span
          aria-hidden={!confirming}
          className={cn(
            faceClass,
            confirming
              ? "scale-100 opacity-100 blur-[0px]"
              : "scale-[1.08] opacity-0 blur-[3px]",
          )}
        >
          {/* The warning arrives on its own scale, bigger than the
              face's: it springs up from small with an overshoot a
              beat after the words settle, so the eye lands on it.
              Disarmed it shrinks back ahead of the face fading. */}
          <ExclamationTriangleIcon
            className={cn(
              "size-4 shrink-0 transition-[scale] duration-[320ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
              confirming
                ? "scale-100 delay-[60ms]"
                : "scale-[0.4] delay-0 duration-[160ms] ease-in",
            )}
          />
          Confirm?
        </span>
      </span>
    </MenuItem>
  );
}
