"use client";

import { Popover } from "@base-ui/react/popover";
import { PencilIcon } from "@heroicons/react/24/solid";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input, InputAddon, InputGroup } from "@/components/ui/input";
import { popupVariants } from "@/components/ui/popup";

/**
 * A name, and a pencil that opens the one field that changes it.
 *
 * ## Why the field is not on the panel
 *
 * It was, and what it did to the panel is the argument against it. A text
 * input with a Save beside it is the loudest thing you can put in a column —
 * a lit box, a button, and a caption under both — and it sat directly beneath
 * the name it edits, saying the same word twice, in a section whose whole job
 * is to show you what other people see. Everything around it commits on touch
 * and needs no button at all; this was the only Save in the app's chrome, and
 * it was drawn as though the panel were a form.
 *
 * So the panel says the name, and a pencil beside it says the name can be
 * changed. The field is still exactly one field and one Save — it just is not
 * on screen until somebody has said they want it, which is the same trade the
 * disc beside it makes.
 *
 * ## Why a popup rather than a field that appears in place
 *
 * Swapping the name for an input pushes everything under it down by the
 * difference between a line of text and a control, and pushes it back up again
 * on Save — the section flinches twice per rename. A popup is drawn over the
 * column instead, anchored to the pencil, and everything behind it holds still.
 * It is the same panel and the same motion the disc editor uses, for the same
 * reason: these are two halves of one row and they should not open in two
 * different ways.
 *
 * ## The two names this edits
 *
 * A handle and a group's title, which are not the same kind of thing — one is
 * rationed for life and screened, the other is free and only has to be a name.
 * What they have in common is everything this component does, so the rules
 * arrive as props: `check` is the objection this side can make before a round
 * trip, `onSave` returns the server's, and `caption` is what the line says when
 * there is no objection at all.
 *
 * ## The line under the field
 *
 * Centred, and never two things at once: the local objection, then the
 * server's, then what it costs. For a handle what it costs is a ration, so the
 * words get a bar on the same line — two changes, for the life of the account,
 * is the sort of fact a sentence states and a shape *shows*, and the two of
 * them are one statement rather than a mark above a caption. It empties as they
 * are spent and is drawn empty when they are gone, which is the one state where
 * the sentence alone is easy to read past.
 *
 * There is no second line above the field. It had one — a gloss beside the
 * heading — and in a panel this wide it truncated to "Old messages keep the old
 * o…", which is worse than saying nothing: a sentence cut off mid-word is a
 * thing the eye stops on and cannot finish.
 */
export function NameEditor({
  value,
  prefix,
  label,
  title,
  maxLength,
  caption,
  allowance,
  disabled,
  transform,
  check,
  onSave,
}: {
  /** What it is now, and what the field opens holding. */
  value: string;
  /** Drawn before the name and before the field, faintly. `@`, or nothing. */
  prefix?: string;
  /** What the pencil is called to a screen reader: "handle", "group name". */
  label: string;
  /** The popup's own heading, and the whole of it. */
  title: string;
  maxLength: number;
  /** The line under the field while nothing is wrong. An allowance, usually. */
  caption?: string;
  /**
   * What is left of a ration, drawn as a bar beside the caption.
   *
   * Only for a name that has one — a handle. A group's title is free, so it
   * gets neither, and the line under its field is empty and not drawn.
   */
  allowance?: { left: number; total: number };
  /** No changes left. The field is still shown, and says why it is shut. */
  disabled?: boolean;
  /** Typing, corrected on the way in — lowercasing a handle, say. */
  transform?: (raw: string) => string;
  /** The objection this side can make, before anything is sent. */
  check?: (wanted: string) => string | null;
  /** Sends it. Returns the server's objection, or `null` when it landed. */
  onSave: (wanted: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Follows the server, for a rename that lands and for one made in another
  // tab. Adjusted during render rather than in an effect, which is what React
  // asks for when a piece of state is a prop plus a memory of it.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
    setNotice(null);
  }

  const wanted = draft.trim();
  // Nothing is wrong with the name you already have — it is simply not a
  // change. Telling somebody their own name is unavailable is the kind of
  // answer that makes an app look broken.
  const shape = wanted === "" || wanted === value ? null : check?.(wanted);
  const ready =
    wanted !== "" && wanted !== value && !shape && !disabled && !busy;

  // One thing under the field, in this order. `problem` is what decides the
  // colour and whether the bar is drawn at all.
  const problem = shape ?? notice;
  const said = problem ?? caption;

  async function save() {
    if (!ready) return;
    setBusy(true);
    setNotice(null);
    const refusal = await onSave(wanted);
    setBusy(false);
    setNotice(refusal);
    // Only on the way through. A refusal keeps the popup open, because the
    // field it is about is in there and the name is still to be changed.
    if (refusal === null) setOpen(false);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={setOpen}
      // Put back once it is gone, not as it starts leaving: a field that resets
      // under a closing panel is the last thing you typed being taken off you
      // in front of you.
      onOpenChangeComplete={(shown) => {
        if (shown) return;
        setDraft(value);
        setNotice(null);
      }}
    >
      <Popover.Trigger
        aria-label={`Change ${label}`}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 data-popup-open:bg-foreground/[0.06] data-popup-open:text-foreground"
      >
        <PencilIcon className="size-3.5" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          className="z-50 outline-none"
        >
          <Popover.Popup
            className={cn(
              popupVariants({ motion: "drop", padding: "md" }),
              "w-[17rem]",
            )}
          >
            <Popover.Title
              render={<p />}
              className="text-[0.875rem] font-semibold"
            >
              {title}
            </Popover.Title>

            <form
              className="mt-2.5 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <InputGroup className="flex-1 gap-1.5">
                {prefix === undefined ? null : (
                  <InputAddon>{prefix}</InputAddon>
                )}
                <Input
                  // The one field in the popup, so the caret is in it on the
                  // frame it opens — nobody presses a pencil to look at a field.
                  autoFocus
                  value={draft}
                  onChange={(event) => {
                    setDraft(
                      transform
                        ? transform(event.target.value)
                        : event.target.value,
                    );
                    setNotice(null);
                  }}
                  disabled={disabled}
                  maxLength={maxLength}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label={label}
                  className="h-9"
                />
              </InputGroup>

              <Button
                type="submit"
                size="lg"
                disabled={!ready}
                className="shadow-none hover:shadow-none"
              >
                {busy ? "…" : "Save"}
              </Button>
            </form>

            {/* Nothing at all when there is nothing to say, which is a
                group's name: it has no ration on it, so an empty line under
                the field would be a space kept for a sentence that never
                comes. */}
            {said === undefined || said === null ? null : (
              <div className="mt-2 flex items-center justify-center gap-2">
                {/* Beside the words rather than over them: it is the same fact
                    twice, so it belongs on the same line, and stacked it read
                    as a heading over a sentence — a second thing to take in
                    before the sentence that says what it means.

                    It goes while something is wrong, because what is wrong is
                    not about the ration, and a measure of one thing next to a
                    complaint about another is how a reader ends up answering
                    the wrong one. */}
                {allowance === undefined || problem ? null : (
                  <span
                    aria-hidden
                    className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-border"
                  >
                    <span
                      className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        width: `${(allowance.left / allowance.total) * 100}%`,
                      }}
                    />
                  </span>
                )}

                <p
                  className={cn(
                    "min-w-0 text-center text-[0.8125rem] leading-snug text-balance",
                    problem ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {said}
                </p>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
