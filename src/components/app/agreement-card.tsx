"use client";

import {
  CheckCircleIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAgreement } from "@/components/app/agreement-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AGREEMENT_CLAUSES,
  AGREEMENT_PHRASE,
  matchesAgreementPhrase,
  onAgreementRequest,
} from "@/lib/agreement";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

/**
 * How long the tick and the word are held before the card starts leaving, and
 * how long each leg of the leaving takes. Three numbers rather than three
 * magic constants scattered through the effects below, because they are one
 * sequence and only make sense read together.
 *
 * `FOLD` and `COLLAPSE` are the durations of actual CSS transitions — the
 * panel's height, then the card's own — so they have to match the classes on
 * those elements. A little slack on each, so the state changes after the
 * motion finishes rather than during its last frame.
 */
const HOLD_MS = 1700;
const FOLD_MS = 340;
const COLLAPSE_MS = 360;

/**
 * Where the card is in its one and only life.
 *
 * `asking` is the card as anyone ever sees it. Everything after it is the
 * send-off, which runs once, on the tick the acceptance lands, and ends with
 * the card unmounted for good.
 */
type Phase = "asking" | "done" | "folding" | "leaving" | "gone";

/**
 * The terms, as a card in the rail that exists only until they are accepted.
 *
 * It sits above the invite card and borrows its mechanics — the measured panel
 * height, the pointerdown-and-Escape close, the icon-button stand-in below
 * `lg`, all of which `InviteCard` explains. What it does not borrow is
 * permanence. Invites are a number you come back to; this is a door, and a
 * door you have already walked through has no business staying in the chrome
 * for the rest of the account's life. So the acceptance is answered — a tick,
 * the word, a fold — and then the card takes its space back and never renders
 * again. The terms themselves live in `src/lib/agreement.ts` if anything ever
 * needs to show them after the fact.
 *
 * Nothing here is the enforcement. The tiles are inert and the activity routes
 * refuse on the server (`src/lib/agreement-gate.ts`); this card is where the
 * refusal is answered. Anything that runs into the gate asks for it by name —
 * see `requestAgreement` — and it opens with the field focused.
 *
 * The phrase is typed rather than checked in a box on purpose. A checkbox is
 * one motion and no reading; four words are four words you have to have looked
 * at the card to know.
 */
export function AgreementCard() {
  const agreement = useAgreement();
  const accept = useMutation(api.agreement.accept);

  const [phase, setPhase] = useState<Phase>("asking");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  // The height the card is holding in the rail as it leaves, so the space can
  // be given back over 300ms instead of vanishing in one frame. `null` until
  // the leaving starts, which is also what says "do not manage this yet".
  const [leaveHeight, setLeaveHeight] = useState<number | null>(null);

  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The panel node itself, held in state rather than a ref, because the effect
  // that measures it has to run when the node *arrives* — see below.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);

  const asking = phase === "asking";
  // True from the moment the mutation lands, which is a frame or two before
  // the subscription catches up. The header is already wearing the answer by
  // then; waiting for the round trip would flash the warning triangle back on.
  const accepted = !asking || (agreement?.agreed ?? false);
  const superseded = agreement?.superseded ?? false;
  const matches = matchesAgreementPhrase(typed);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  // The field is what the card is for. Once the send-off is running there is
  // nothing to type into and nothing to focus.
  useEffect(() => {
    if (open && asking) inputRef.current?.focus();
  }, [open, asking]);

  // Anything that hit the gate — a locked tile, the locked activity page —
  // asks for the card rather than reaching into it. It always opens, never
  // toggles: the request means "I need this open", and a second locked tile
  // clicked while the card is already open should not put it away.
  useEffect(
    () =>
      onAgreementRequest(() => {
        setError(null);
        setOpen(true);
      }),
    [],
  );

  // The panel's height changes under it — an error appears, the form is
  // replaced by the tick — and each of those should carry the card to its new
  // size rather than snap it there. See `InviteCard`.
  //
  // Keyed to the node and not to `[]`, which is the difference between this
  // working and the card opening to nothing at all. Unlike the invite card,
  // this one returns `null` until the answer is known, so on the render where
  // the effect would have run there is no panel to observe — and an effect
  // with no dependencies never runs again to find the one that turns up a
  // moment later. The measured height stays 0, the panel opens to 0, and the
  // card sits there wide and empty with its chevron pointing up.
  useEffect(() => {
    if (!panel) return;

    // No initial measurement of our own: observing an element delivers a
    // first observation for it, so the callback below is the measurement.
    const observer = new ResizeObserver(() =>
      setPanelHeight(panel.offsetHeight),
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panel]);

  useEffect(() => {
    // Not while the send-off is running: a click landing somewhere else in
    // that second and a half should not cut it short, and there is nothing
    // left in here to dismiss.
    if (!open || !asking) return;

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
  }, [open, asking, close]);

  /* The send-off, one leg per effect.
   *
   * Split rather than written as one chain of nested timeouts because each leg
   * is a state change whose *motion* is a CSS transition on a different
   * element — the panel folds, then the card collapses — and the only job of
   * the timers is to move to the next leg once the last one has finished
   * moving. Nothing here animates in JavaScript. */

  // Hold the tick, then fold the panel away.
  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => {
      setOpen(false);
      setPhase("folding");
    }, HOLD_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "folding") return;
    const timer = setTimeout(() => setPhase("leaving"), FOLD_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Give the rail its space back. The height has to be written before it can
  // be transitioned away — `auto` is not interpolable, which is the same
  // reason the panel above is measured — so it is set to what the card
  // currently is, allowed to paint, and only then set to zero.
  useEffect(() => {
    if (phase !== "leaving") return;

    const el = rootRef.current;
    if (!el) {
      setPhase("gone");
      return;
    }

    setLeaveHeight(el.offsetHeight);

    // Two frames, not one: the first only guarantees the browser has the style
    // change, the second that it has painted it. Collapsing from a height the
    // element never actually held is a jump, not a transition.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setLeaveHeight(0));
    });
    const timer = setTimeout(() => setPhase("gone"), COLLAPSE_MS);

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      clearTimeout(timer);
    };
  }, [phase]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !matches) return;

    setError(null);
    setSaving(true);
    try {
      // The server checks the phrase again. This branch is for the case where
      // the two copies of it have drifted — the card would enable a button the
      // server then refuses, and saying so is better than a click that does
      // nothing.
      const result = await accept({ typed });
      if (result.ok) {
        setTyped("");
        setPhase("done");
      } else if (result.reason === "phrase") {
        setError(`Type ${AGREEMENT_PHRASE} exactly.`);
      } else setError("You are not signed in.");
    } catch {
      setError("That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function toggle() {
    if (!asking) return;
    if (open) close();
    else setOpen(true);
  }

  // Nothing to draw until there is a real answer — see `useAgreement`, and
  // note that this is what keeps a red card from flashing into the rail on
  // every load of every page. An account that agreed on some earlier visit
  // gets no card at all: that is the "forever" half of the send-off, and the
  // reason the send-off itself has to keep rendering until `gone` even though
  // the subscription has long since said `agreed`.
  if (!agreement || phase === "gone") return null;
  if (agreement.agreed && asking) return null;

  const leaving = leaveHeight !== null;

  return (
    <div
      ref={rootRef}
      style={
        leaving
          ? { height: leaveHeight, opacity: leaveHeight ? 1 : 0 }
          : undefined
      }
      className={cn(
        "relative shrink-0 pb-1 pl-3",
        leaving &&
          "overflow-hidden transition-[height,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
      )}
    >
      {/* The collapsed rail's stand-in. The dot is the whole state that
          survives at 4.5rem: something is waiting on you, or nothing is. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          accepted ? "Agreement, accepted" : "Agreement, not accepted"
        }
        className="rail-narrow relative flex h-11 w-full cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset wide:hidden"
      >
        {accepted ? (
          <CheckCircleIcon className="size-5 text-primary" />
        ) : (
          <>
            <ExclamationTriangleIcon className="size-5 text-destructive" />
            <span className="absolute top-2.5 right-3.5 size-2 rounded-full bg-destructive" />
          </>
        )}
      </button>

      <Card
        className={cn(
          "overflow-hidden rounded-xl",
          "transition-[width,box-shadow,opacity,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          // The same two widths as the invite card below it, so the two grow
          // to the same edge and read as one column rather than two cards that
          // happen to be stacked.
          open
            ? "z-30 shadow-lg shadow-black/[0.08] wide:relative wide:w-[21rem]"
            : "wide:w-[14.25rem]",
          "narrow:absolute narrow:bottom-full narrow:left-3 narrow:mb-1 narrow:w-72 narrow:shadow-lg",
          !open && "narrow:invisible narrow:opacity-0",
          // And the same timing across the rail's own collapse and expand;
          // the invite card explains it.
          "wide:delay-[0s,0s,150ms,150ms]",
          !open && "collapsed:duration-0",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className={cn(
            "w-full px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
            asking ? "cursor-pointer" : "cursor-default",
          )}
        >
          <div className="flex items-center gap-2">
            {accepted ? (
              <CheckCircleIcon className="size-4 shrink-0 text-primary" />
            ) : (
              <ExclamationTriangleIcon className="size-4 shrink-0 text-destructive" />
            )}
            <span className="flex-1 text-[0.875rem] font-medium text-foreground">
              Agreement
            </span>
            <span
              className={cn(
                "text-[0.8125rem]",
                accepted ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {accepted ? "Accepted" : superseded ? "Updated" : "Required"}
            </span>
            <ChevronDownIcon
              className={cn(
                "size-4 shrink-0 text-faint transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                open && "rotate-180",
                // Nothing to expand once the send-off is running, so the
                // affordance goes with it.
                !asking && "opacity-0",
              )}
            />
          </div>

          {/* The invite card's row of pips, with one slot in it — because
              there is one thing to do and it is either done or it is not. Same
              height and same place, so the two cards keep one rhythm.
              Unaccepted it is not an empty slot but a barrier: see
              `.hazard-bar` in `globals.css`. */}
          <div className="mt-2.5">
            <div
              className={cn(
                "h-1.5 overflow-hidden rounded-full transition-colors duration-300",
                accepted ? "bg-primary" : "hazard-bar",
              )}
            />
          </div>
        </button>

        <div
          id={panelId}
          inert={!open}
          style={{ height: open ? panelHeight : 0 }}
          className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        >
          <div
            ref={setPanel}
            className={cn(
              "border-t border-border px-3 pt-3 pb-3 transition-opacity duration-200",
              open ? "opacity-100 delay-150" : "opacity-0",
            )}
          >
            {asking ? (
              <>
                <ul className="flex flex-col gap-2">
                  {AGREEMENT_CLAUSES.map((clause) => (
                    <li
                      key={clause}
                      className="flex gap-2 text-[0.8125rem] leading-relaxed text-muted-foreground"
                    >
                      <span
                        aria-hidden
                        className="mt-[0.5rem] size-1 shrink-0 rounded-full bg-border-strong"
                      />
                      <span>{clause}</span>
                    </li>
                  ))}
                </ul>

                <form
                  onSubmit={submit}
                  className="mt-3 border-t border-border pt-3"
                >
                  <p className="text-[0.8125rem] leading-relaxed text-foreground">
                    {superseded
                      ? `The terms have changed since you last agreed. Type ${AGREEMENT_PHRASE} to accept them again.`
                      : `Type ${AGREEMENT_PHRASE} to agree. Nothing opens until you do.`}
                  </p>

                  <div className="mt-2.5 flex gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      name="agreement"
                      value={typed}
                      onChange={(event) => setTyped(event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={saving}
                      placeholder={AGREEMENT_PHRASE}
                      aria-label={`Type ${AGREEMENT_PHRASE} to agree`}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[0.875rem] transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    />
                    <Button
                      type="submit"
                      size="lg"
                      disabled={saving || !matches}
                      className="shadow-none hover:shadow-none"
                    >
                      {saving ? "Saving…" : "Agree"}
                    </Button>
                  </div>

                  {error && (
                    <p
                      role="status"
                      className="mt-2.5 text-[0.8125rem] leading-relaxed text-destructive"
                    >
                      {error}
                    </p>
                  )}
                </form>
              </>
            ) : (
              /* The send-off. The terms and the field are gone the instant the
                 acceptance lands — they are answered, and leaving them under
                 the tick would make this a receipt rather than a door closing.
                 The panel is measured, so the card rides down to this height
                 on the same curve everything else here moves on. */
              <div
                role="status"
                className="flex flex-col items-center justify-center py-6"
              >
                <div className="relative flex items-center justify-center">
                  <span
                    aria-hidden
                    className="agree-ring absolute size-12 rounded-full border-2 border-primary"
                  />
                  <CheckCircleIcon className="agree-pop size-12 text-primary" />
                </div>
                <p className="agree-rise mt-3 text-[0.9375rem] font-medium text-foreground">
                  Enjoy!
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
