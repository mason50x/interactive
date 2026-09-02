"use client";

import {
  ChevronDownIcon,
  ExclamationTriangleIcon,
  TicketIcon,
} from "@heroicons/react/24/solid";
import { useConvexAuth, useQuery } from "convex/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { revokeInvite, sendInvite } from "@/lib/invite-actions";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

/**
 * The allowance, live.
 *
 * `null` is "no numbers yet" — the state the card draws as a bare rail with no
 * count beside it — and it covers both of the ways there can be none.
 *
 * The query is skipped until Clerk's token has actually reached the Convex
 * client rather than run and answered `null` for "nobody is signed in". The
 * answer is the same either way here, but the two are not the same thing, and
 * the agreement card next door was reading exactly that `null` as a settled
 * reply and asking accounts that had already agreed to agree again on every
 * refresh. On a cold load this is a second or two of Clerk booting, which is
 * why the card can sit on its skeleton for a moment before the pips arrive.
 */
export function useInvites() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.invites.mine, isAuthenticated ? {} : "skip") ?? null;
}

/**
 * The allowance, drawn as slots rather than counted in a sentence.
 *
 * The allowance is small enough to take in at a glance, so the shape of the
 * thing — finite, and nearly gone — reads faster as a row of pips than as a
 * fraction.
 * The blue is what is left, and it drains right to left, the way a bar that
 * fills left to right empties — so the run of blue starts at the same edge the
 * row starts at and shortens towards it as the allowance goes.
 */
function Pips({ remaining, limit }: { remaining: number; limit: number }) {
  return (
    <div aria-hidden className="flex gap-1">
      {Array.from({ length: limit }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors duration-300",
            index < remaining ? "bg-primary" : "bg-border-strong",
          )}
        />
      ))}
    </div>
  );
}

/**
 * How long the receipt holds the panel after a send. Long enough to read two
 * short lines without being asked to, short enough that nobody starts
 * wondering whether the card has got stuck.
 */
const RECEIPT_MS = 4000;

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
 */
export function InviteCard() {
  const invites = useInvites();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [panelHeight, setPanelHeight] = useState(0);

  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = invites?.remaining ?? 0;
  const limit = invites?.limit ?? 0;
  const exhausted = invites !== null && remaining === 0;

  // A card reopened onto the last attempt's error — or onto the last one's
  // receipt — would be reporting on something the person has already moved
  // past.
  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setSent(false);
  }, []);

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

  // The receipt is a beat, not a state to be dismissed. It has nothing to act
  // on and the card behind it is still the answer, so it hands the panel back
  // on its own rather than leaving a notice for someone to clear.
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(false), RECEIPT_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  // Observed rather than measured once: the panel's height changes under it
  // when an invite is sent, revoked, or an error appears, and each of those
  // should carry the card to its new size rather than snap it there.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const observer = new ResizeObserver(() =>
      setPanelHeight(panel.offsetHeight),
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;

    // `pointerdown` rather than `click`: the card should be on its way out by
    // the time whatever was clicked responds, not a frame behind it.
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    // Held across the await: the field is cleared on success, and the server
    // needs the address that was there when the form was submitted.
    const address = email.trim();
    if (address === "") return;

    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await sendInvite(address);
      // That it sent is not the news — the address drops off the field and
      // turns up in the list below with a pip spent beside it, which says so
      // already. The spam folder is: the mail comes from Clerk rather than
      // from anyone the recipient knows, so the one thing worth the panel is
      // the place they will have to go looking for it.
      if (result.ok) {
        setEmail("");
        setSent(true);
      } else {
        setError(result.message);
      }
    });
  }

  function revoke(inviteId: string) {
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await revokeInvite(inviteId);
      if (!result.ok) setError(result.message);
    });
  }

  function toggle() {
    if (open) close();
    else setOpen(true);
  }

  return (
    <div ref={rootRef} className="relative shrink-0 pb-2 pl-3">
      {/* The collapsed rail's stand-in. The count rides on the icon because
          that is the only part of the card that survives at 4.5rem. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          invites === null ? "Invites" : `Invites, ${remaining} remaining`
        }
        className="rail-narrow relative flex h-11 w-full cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset wide:hidden"
      >
        <TicketIcon className="size-5" />
        {invites !== null && remaining > 0 && (
          <span className="absolute top-1.5 right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-semibold text-primary-foreground tabular-nums">
            {remaining}
          </span>
        )}
      </button>

      <Card
        className={cn(
          // The app's card surface at the rail's radius rather than the
          // marketing pages' 1.5rem: it sits a few pixels from the account
          // button and the nav rows, which are all `rounded-xl`.
          "overflow-hidden rounded-xl",
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
              {invites === null ? "" : `${remaining} left`}
            </span>
            <ChevronDownIcon
              className={cn(
                "size-4 shrink-0 text-faint transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                open && "rotate-180",
              )}
            />
          </div>

          <div className="mt-2.5">
            {invites === null ? (
              <div className="h-1.5 rounded-full bg-muted" />
            ) : (
              <Pips remaining={remaining} limit={limit} />
            )}
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
            {sent ? (
              /* The receipt takes the whole panel rather than sitting under
                 the field as a line. The delivery problem is the one thing a
                 sender can do anything about, and a caution the width of the
                 card is read; the same words in a status line under a form
                 that is ready for the next address are not. */
              <div role="status" className="flex items-start gap-3">
                <ExclamationTriangleIcon className="mt-px size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-[0.875rem] leading-snug font-medium text-foreground">
                    Remind them to check the spam or junk
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
                    We&rsquo;re working on it.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <form onSubmit={submit} className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="email"
                    name="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    // Native validation catches a malformed address before the
                    // round trip; the server checks it again, because this one
                    // is advisory.
                    required
                    autoComplete="off"
                    disabled={exhausted || pending}
                    placeholder={
                      exhausted ? "No invites left" : "friend@example.com"
                    }
                    aria-label="Email address to invite"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[0.875rem] transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    disabled={exhausted || pending || email.trim() === ""}
                    // The primary variant carries a brand-coloured glow on
                    // hover. That is a marketing-page gesture; in a card this
                    // size, sitting in the chrome, it reads as a light leak.
                    className="shadow-none hover:shadow-none"
                  >
                    {pending ? "Sending…" : "Send"}
                  </Button>
                </form>

                {error && (
                  <p
                    // Assertive would talk over the person mid-correction; this
                    // is a result they arrive at after submitting, not an
                    // interruption.
                    role="status"
                    className="mt-2.5 text-[0.8125rem] leading-relaxed text-destructive"
                  >
                    {error}
                  </p>
                )}

                {invites !== null && invites.invites.length > 0 && (
                  <ul className="mt-2 flex flex-col">
                    {invites.invites.map((invite) => (
                      <li
                        key={invite.id}
                        className="group/invite flex h-9 items-center gap-3"
                      >
                        <span
                          title={invite.email}
                          className="min-w-0 flex-1 truncate text-[0.875rem] text-muted-foreground"
                        >
                          {invite.email}
                        </span>

                        {invite.status === "accepted" ? (
                          <span className="label-small shrink-0 text-muted-foreground">
                            Joined
                          </span>
                        ) : (
                          <>
                            {/* Swapped rather than shown side by side: the label
                              is the resting state and the action replaces it,
                              so the row never changes width on hover. */}
                            <span className="label-small shrink-0 text-faint group-hover/invite:hidden">
                              Pending
                            </span>
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={pending}
                              onClick={() => revoke(invite.id)}
                              className="hidden shrink-0 text-muted-foreground group-hover/invite:inline-flex hover:text-destructive"
                            >
                              Revoke
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
