"use client";

import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/solid";
import Link from "next/link";
import type { ReactNode } from "react";
import { ACTIVITIES_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The controls, as a pill in the top-right corner.
 *
 * Collapsed it is two controls: full screen, which is the one reached for
 * mid-activity, and the settings cog that runs the rest of the bar out to the
 * left. Nothing here auto-opens on hover: the pointer is in the activity, and
 * a toolbar that unfurls whenever you cross the corner would be in the way
 * exactly when the activity is.
 */
export function ActivityControls({
  title,
  open,
  onToggle,
  onReload,
  full,
  canFull,
  onToggleFull,
  backHref = ACTIVITIES_HREF,
  backLabel = "Back to activities",
  contentLabel = "activity",
  positioned = true,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
  contentLabel?: string;
  positioned?: boolean;
  open: boolean;
  onToggle: () => void;
  onReload: () => void;
  full: boolean;
  canFull: boolean;
  onToggleFull: () => void;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-full items-center rounded-full p-1",
        positioned && "absolute top-3 right-3 z-20",
        // Its own palette, not the app's. This sits on whatever the activity
        // happens to be drawing, so it cannot borrow a surface token and
        // expect contrast — a dark glass plate reads against all of them.
        "border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-md",
      )}
    >
      {/*
       * A grid column animating between `0fr` and `1fr` — the one way to
       * transition to a width the content decides, which this has to be
       * because the activity's title is in it.
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
          <div className="flex items-center gap-0.5 pr-0.5">
            <span className="hidden max-w-[14rem] truncate px-2 text-[0.875rem] whitespace-nowrap text-white/85 sm:block">
              {title}
            </span>

            <ControlLink href={backHref} label={backLabel}>
              <ArrowLeftIcon className="size-4" />
            </ControlLink>

            <Control onClick={onReload} label={`Restart ${contentLabel}`}>
              <ArrowPathIcon className="size-4" />
            </Control>
          </div>
        </div>
      </div>

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

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} ${contentLabel} controls`}
        title={`${open ? "Hide" : "Show"} ${contentLabel} controls`}
        className={cn(CONTROL_CLASS, open && "bg-white/15 text-white")}
      >
        <Cog6ToothIcon className="size-4" />
      </button>
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
