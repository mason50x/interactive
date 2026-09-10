"use client";

import { ChevronDownIcon, TicketIcon } from "@heroicons/react/24/solid";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { InvitePanel } from "@/components/app/invite/invite-panel";
import { useInviteActions } from "@/components/app/invite/use-invite-actions";
import { RailButton } from "@/components/app/rail/rail-button";
import { CountBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Pips } from "@/components/ui/pips";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { useClickOutside } from "@/lib/use-click-outside";
import { cn } from "@/lib/utils";
import { api } from "@convex/_generated/api";

/**
 * The allowance, live.
 *
 * `null` is "no numbers yet" — the state the card draws as a bare rail with no
 * count beside it — and it covers both of the ways there can be none.
 *
 * The query is skipped until Clerk's token has actually reached the Convex
 * client rather than run and answered `null` for "nobody is signed in". The
 * card waits for authentication before fetching its allowance, which is
 * why the card can sit on its skeleton for a moment before the pips arrive.
 */
export function useInvites() {
  return useAuthedQuery(api.invites.mine, {}) ?? null;
}

/**
 * Invites, as a card in the rail rather than a row in the account menu.
 *
 * It is the one thing in this chrome that changes on its own, and the only
 * reason to open the account menu was to look at it — so it sits out here in
 * the open, above the account button, and reports without being asked.
 *
 * Clicking it does not launch anything. The card grows: the same surface,
 * taller, with the field and the list of who you have already invited
 * underneath. That is deliberate — sending an invite is one short field and a
 * list you glance at, which is far less than a modal's worth of ceremony, and
 * a dialog would take the page away to ask for an email address.
 *
 * The height is measured rather than guessed: a `ResizeObserver` on the panel
 * keeps its natural height in state, and the wrapper transitions to that
 * number. `height: auto` is not interpolable, and the `0fr`/`1fr` grid trick
 * squashes the contents on the way through — measuring means the panel slides
 * at its real size, and means the card re-settles just as smoothly when a sent
 * invite adds a row to the list underneath. The closed panel is `inert` so the
 * field inside it is not a tab stop while it is folded away.
 *
 * Clicking anywhere else closes it, as does Escape. Nothing here is a modal —
 * the page behind it stays live and clickable — so the click that takes you
 * somewhere else should also put the card away rather than leaving it open
 * over the shell.
 *
 * Below `lg` the rail is 4.5rem of icons and there is no card to be had, so
 * the same state drives a badge-carrying icon button, and the card opens above
 * it at a width of its own. It still grows out of the control that opened it;
 * it just has to borrow room from the shell to do it.
 *
 * A zero allowance is the server's off switch (see `INVITE_LIMIT` in
 * `convex/invites.ts`), and while it is thrown the card is not drawn at all.
 * There is nothing for it to report, and a card that reads "disabled" is a
 * card that asks to be enabled. Nothing renders until the numbers arrive
 * either, so the card does not paint a skeleton and then take it away.
 * Restoring the limit brings it back without another change here.
 */
export function InviteCard() {
  const invites = useInvites();
  const [open, setOpen] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const { reset, sent, ...actions } = useInviteActions();

  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = invites?.remaining ?? 0;
  const limit = invites?.limit ?? 0;
  const hidden = invites === null || limit === 0;
  const exhausted = invites !== null && remaining === 0;

  // A card reopened onto the last attempt's error — or onto the last one's
  // receipt — would be reporting on something the person has already moved
  // past.
  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  // Opening the card is the whole of the intent — nobody expands this to
  // admire it — so the field is ready to type into. Closing deliberately does
  // not restore focus: the card is at the foot of the rail, and pulling focus
  // back to a control down there after someone has moved on is worse than
  // leaving it where they put it.
  //
  // The receipt takes the field away with it, which drops focus to the body;
  // running again when it clears puts the caret back where the next address
  // would go.
  useEffect(() => {
    if (open && !sent) inputRef.current?.focus();
  }, [open, sent]);

  // Observed rather than measured once: the panel's height changes under it
  // when an invite is sent, revoked, or an error appears, and each of those
  // should carry the card to its new size rather than snap it there.
  // `hidden` is a dependency because the panel is not in the tree until the
  // allowance has arrived; the observer has to be attached once it is.
  useEffect(() => {
    if (hidden) return;
    const panel = panelRef.current;
    if (!panel) return;

    const observer = new ResizeObserver(() =>
      setPanelHeight(panel.offsetHeight),
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, [hidden]);

  // `pointerdown` rather than `click`: the card should be on its way out by
  // the time whatever was clicked responds, not a frame behind it.
  useClickOutside(rootRef, close, open);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  function toggle() {
    if (open) close();
    else setOpen(true);
  }

  if (hidden) return null;

  return (
    <div ref={rootRef} className="relative shrink-0 pb-2 pl-3">
      {/* The collapsed rail's stand-in. The count rides on the icon because
          that is the only part of the card that survives at 4.5rem. */}
      <RailButton
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Invites, ${remaining} remaining`}
        className="relative"
      >
        <TicketIcon className="size-5" />
        {remaining > 0 && (
          <CountBadge className="absolute top-1.5 right-2.5">
            {remaining}
          </CountBadge>
        )}
      </RailButton>

      <Card
        // The app's card surface at the rail's radius rather than the
        // marketing pages' 1.5rem: it sits a few pixels from the account
        // button and the nav rows, which are all `rounded-xl`.
        radius="sm"
        className={cn(
          "overflow-hidden",
          // One curve and one duration for everything that moves — width here,
          // height on the panel below, the chevron — so the card reads as a
          // single object changing shape rather than three things animating at
          // each other. The curve is fast out of the gate and long on the
          // settle, which is what keeps a box this small from looking like it
          // jumped.
          "transition-[width,box-shadow,opacity,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          // Open, it grows out of the rail rather than inside it. Only the
          // bottom-left corner is pinned: the account button below holds the
          // floor, the nav list above gives up the height, and the extra width
          // comes off the shell — which is also why the open card is the one
          // that carries a shadow. A field and a Send button do not fit in a
          // 14rem column without one of them becoming a stub.
          //
          // Both widths are absolute lengths so there is something to
          // interpolate; `w-full` would be a percentage, and the snap back to
          // it on close is the one part that cannot be eased. The closed width
          // is the rail (`wide:w-60`) less this wrapper's `pl-3` — change
          // either and they stop lining up.
          open
            ? "z-30 shadow-lg shadow-black/[0.08] wide:relative wide:w-[21rem]"
            : "wide:w-[14.25rem]",
          // On the narrow rail — below `lg`, or collapsed — the rail is 4.5rem
          // of icons and there is no closed card to grow, so it opens over the
          // shell off the icon button instead. `invisible` rather than
          // `hidden` for the closed state: it takes the card out of the tab
          // order the same way, but it is a property that can be transitioned,
          // so the card fades instead of blinking.
          "narrow:absolute narrow:bottom-full narrow:left-3 narrow:mb-1 narrow:w-72 narrow:shadow-lg",
          !open && "narrow:invisible narrow:opacity-0",
          // The rail's own collapse and expand, which move this card between
          // its two closed forms. It cannot follow the width transition (see
          // `rail-wide` in `globals.css`), so on the way in it holds off for
          // half the move before fading — the delay is on opacity and
          // visibility only, so the widths above still ease from a click —
          // and on the way out, closed, it goes at once. That last rule also
          // catches the popover closing on a collapsed rail, which blinks
          // shut where it fades below `lg`; the alternative was the closed
          // card jumping to the popover's spot and fading there.
          "wide:delay-[0s,0s,150ms,150ms]",
          !open && "collapsed:duration-0",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="w-full cursor-pointer px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
        >
          <div className="flex items-center gap-2">
            <TicketIcon className="size-4 shrink-0 text-primary" />
            <span className="flex-1 text-[0.875rem] font-medium text-foreground">
              Invites
            </span>
            <span className="text-[0.8125rem] text-muted-foreground tabular-nums">
              {remaining} left
            </span>
            <ChevronDownIcon
              className={cn(
                "size-4 shrink-0 text-faint transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                open && "rotate-180",
              )}
            />
          </div>

          {/* The allowance, drawn as slots rather than counted in a sentence:
              small enough to take in at a glance, so the shape of the thing —
              finite, and nearly gone — reads faster as a row of pips than as
              a fraction. */}
          <div className="mt-2.5">
            <Pips remaining={remaining} limit={limit} />
          </div>
        </button>

        <div
          id={panelId}
          inert={!open}
          style={{ height: open ? panelHeight : 0 }}
          className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        >
          {/* The contents fade on their own clock — held back on the way in
              until the card has most of its height, and gone early on the way
              out. Sliding text up behind a closing edge is the part that reads
              as clunky; this leaves the shape to do the moving. */}
          <div
            ref={panelRef}
            className={cn(
              "border-t border-border px-3 pt-3 pb-3 transition-opacity duration-200",
              open ? "opacity-100 delay-150" : "opacity-0",
            )}
          >
            <InvitePanel
              invites={invites}
              exhausted={exhausted}
              inputRef={inputRef}
              sent={sent}
              {...actions}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
