"use client";

import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/solid";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/wordmark";
import { ACTIVITIES_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The controls, as a pill that lives behind the logo.
 *
 * Collapsed it is one 36px mark in the corner, which is about as little as a
 * control can take from a full-bleed activity while still being findable. Pressing
 * it runs the rest of the bar out to the right. Nothing here auto-opens on
 * hover: the pointer is in the activity, and a toolbar that unfurls whenever you
 * cross the top-left corner would be in the way exactly when the activity is.
 *
 * The mark is the affordance on purpose. It is the one thing on screen that is
 * unambiguously the app rather than the activity, which makes it the thing to
 * press when you want out — the same reason a console's home button carries
 * the maker's badge.
 *
 * The panic control is the one thing that does not fold away with the rest. A
 * way out that takes two presses is not a way out, and the first of those two
 * would be a press that opens a bar and announces itself. It appears only for
 * an account that has turned the panic key on, so it is never a control
 * somebody has to explain having.
 */
export function ActivityControls({
  title,
  open,
  onToggle,
  onReload,
  full,
  canFull,
  onToggleFull,
  onPanic,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  onReload: () => void;
  full: boolean;
  canFull: boolean;
  onToggleFull: () => void;
  /** `null` when the account has no panic key set. */
  onPanic: (() => void) | null;
}) {
  return (
    <div
      className={cn(
        "absolute top-3 left-3 z-20 flex items-center rounded-full p-1",
        // Its own palette, not the app's. This sits on whatever the activity
        // happens to be drawing, so it cannot borrow a surface token and
        // expect contrast — a dark glass plate reads against all of them.
        "border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-md",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? "Hide activity controls" : "Show activity controls"}
        className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/15"
      >
        <LogoMark className="h-4 w-[1.1rem]" />
      </button>

      {/* Named plainly, so the one control nobody will be reading carefully
          when they reach for it says what it does. Still not red: the tooltip
          is only there once you have already gone looking with the pointer,
          where a warning colour sits on the screen the whole time. */}
      {onPanic && (
        <Control onClick={onPanic} label="PANIC">
          <EyeSlashIcon className="size-4" />
        </Control>
      )}

      {/*
       * A grid column animating between `0fr` and `1fr` — the one way to
       * transition to a width the content decides, which this has to be
       * because the activity's title is in it.
       *
       * The same trick was wrong on the activity tiles, where it put a layout
       * pass in every frame of a hover that could be running on eighty cards
       * at once. Here it is one element, moving once per press, with nothing
       * beside it to keep in sync.
       */}
      <div
        className={cn(
          "grid transition-[grid-template-columns] duration-300 ease-out",
          open ? "grid-cols-[1fr]" : "grid-cols-[0fr]",
        )}
      >
        {/* `inert` and not just `overflow-hidden`: a clipped button is still
            in the tab order, and tabbing into a control you cannot see is how
            focus disappears. */}
        <div className="overflow-hidden" inert={!open}>
          <div className="flex items-center gap-0.5 pl-0.5">
            <ControlLink href={ACTIVITIES_HREF} label="Back to activities">
              <ArrowLeftIcon className="size-4" />
            </ControlLink>

            <Control onClick={onReload} label="Restart activity">
              <ArrowPathIcon className="size-4" />
            </Control>

            {canFull && (
              <Control
                onClick={onToggleFull}
                label={full ? "Exit full screen" : "Full screen"}
              >
                {full ? (
                  <ArrowsPointingInIcon className="size-4" />
                ) : (
                  <ArrowsPointingOutIcon className="size-4" />
                )}
              </Control>
            )}

            <span className="max-w-[14rem] truncate px-2 text-[0.875rem] whitespace-nowrap text-white/85">
              {title}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One round control in the pill, in the pill's own palette rather than the
 *  app's — see the plate above for why a `Button` variant would not do. */
const CONTROL_CLASS =
  "flex size-9 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors outline-none hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70";

function Control({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={CONTROL_CLASS}
    >
      {children}
    </button>
  );
}

function ControlLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={CONTROL_CLASS}
    >
      {children}
    </Link>
  );
}
