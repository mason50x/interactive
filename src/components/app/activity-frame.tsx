"use client";

import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
} from "@heroicons/react/24/solid";
import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { LogoMark } from "@/components/wordmark";
import { ACTIVITIES_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The app's side of the origin boundary.
 *
 * The frame is the only thing the app gives an activity, and it now gets the whole
 * shell to itself — no heading, no margin, no page around it. An activity is not a
 * document with a title above it; it is the thing you came for, and every
 * pixel spent framing it is a pixel it does not get.
 *
 * The frame points at `/learn/<slug>` on this same origin, which in turn
 * frames the bundle on the asset origin (see `HostedActivity`). The controls
 * still never touch the framed document: the *bundle* two levels down is
 * cross-origin, so `contentWindow` access is refused all the way up. That
 * constraint is what shapes the controls — see `reload` below.
 *
 * This used to also listen for a `postMessage` score envelope, which is how a
 * activity we compiled ourselves reported a result back without being trusted
 * to write it. Every activity is now a third-party bundle that knows nothing of
 * that protocol, so the listener could not fire and the panel under the board
 * showed an empty state forever.
 *
 * If an activity of ours returns, the contract to restore is: the bundle posts
 * `{ source: "activity", type: "score", slug, score }` to the app's origin,
 * the app checks `event.origin` against the asset origin exactly, and the
 * value is treated as a *claim* — display only. Anything durable, a ranking or
 * a streak, has to be written by code the framed document cannot reach.
 */
export function ActivityFrame({
  title,
  src,
}: {
  title: string;
  src: string;
}) {
  // The element that goes fullscreen. The stage rather than the iframe, so the
  // controls come with it — fullscreening the iframe alone would hand the
  // whole screen to the activity with no way back but Escape.
  const stage = useRef<HTMLDivElement>(null);

  /**
   * Reload, the only way it can be done from here.
   *
   * There is no reaching into a cross-origin frame to refresh it, and
   * re-assigning the same `src` is a no-op in every browser. Remounting the
   * element is the reset: React tears the old frame down, the activity's whole
   * world goes with it, and a new document loads from the same signed URL.
   */
  const [run, setRun] = useState(0);

  const [open, setOpen] = useState(false);

  // Both of these are the browser's state, not ours, so they are read from it
  // rather than mirrored into a `useState` that can fall out of step. Coming
  // *out* of fullscreen is the case that makes this matter: Escape and the
  // browser's own controls do it without going through our button.
  //
  // Compared against the stage rather than tested for null, because a video
  // going fullscreen inside the activity reports the *iframe* as the fullscreen
  // element, and that is the activity's business rather than ours.
  const full = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement === stage.current,
    () => false,
  );

  // Asked rather than assumed: iOS Safari has no element fullscreen at all,
  // and a button that does nothing is worse than no button.
  const canFull = useSyncExternalStore(
    subscribeNever,
    () => document.fullscreenEnabled,
    () => false,
  );

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      // Rejects when the gesture that triggered it has expired. Nothing to
      // recover — the page is unchanged and the button is still there.
      stage.current?.requestFullscreen().catch(() => {});
    }
  }, []);

  return (
    <div ref={stage} className="relative size-full bg-[#111418]">
      <iframe
        key={run}
        src={src}
        title={title}
        // This frame is a capability pass-through, not the security boundary.
        // Its direct child is `/learn`, our own page on this same origin, so
        // the sandbox does nothing to *it* — a same-origin frame with
        // `allow-scripts` is unconstrained either way. What the sandbox governs
        // is the *bundle* two levels down, which `/learn` frames on the asset
        // origin: a nested frame can only narrow the flags it inherits, never
        // widen them, so every capability the bundle needs must be granted here
        // or it is stripped before it arrives.
        //
        // `allow-same-origin` therefore stays: without it the bundle is forced
        // to an opaque origin and loses the per-activity storage its save
        // states live in. It costs nothing here — the bundle is cross-origin to
        // the app regardless of this flag, so being granted its own origin
        // never brings it any closer to the session. `allow-pointer-lock` is
        // what the driving and 3D titles need to capture the mouse.
        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
        allow="gamepad; fullscreen; autoplay"
        referrerPolicy="no-referrer"
        className="block size-full border-0"
      />

      <ActivityControls
        title={title}
        open={open}
        onToggle={() => setOpen((value) => !value)}
        onReload={() => setRun((value) => value + 1)}
        full={full}
        canFull={canFull}
        onToggleFull={toggleFull}
      />
    </div>
  );
}

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

/** For a value the browser fixes at load and never changes again. */
const subscribeNever = () => () => {};

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
 */
function ActivityControls({
  title,
  open,
  onToggle,
  onReload,
  full,
  canFull,
  onToggleFull,
}: {
  title: string;
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
        "absolute top-3 left-3 z-10 flex items-center rounded-full p-1",
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

const CONTROL_CLASS =
  "flex size-9 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors outline-none hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70";

function Control({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
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
  children: React.ReactNode;
}) {
  return (
    <Link href={href} aria-label={label} title={label} className={CONTROL_CLASS}>
      {children}
    </Link>
  );
}
