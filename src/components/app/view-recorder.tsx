"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { useTzOffset } from "@/lib/use-tz-offset";
import { api } from "@convex/_generated/api";

/**
 * Records that an activity was opened, and how long it stayed open.
 *
 * Renders nothing. It is a sibling of `ActivityFrame` rather than something
 * inside it because the frame is the origin boundary — it holds a
 * cross-origin document and a sandbox attribute, and the last thing it needs
 * is a Convex mutation hanging off the same component. Neither knows about the
 * other; both just happen to be on the activity page.
 *
 * ## Why time is accrued here and sent in ticks
 *
 * The obvious shape is a session: write a row on mount, close it on unmount.
 * It does not survive contact with a browser. A tab that is closed, killed by
 * the OS, or put to sleep never runs its unmount, so every one of those
 * sessions stays open forever and the number is wrong in the direction that
 * looks like a bug.
 *
 * So there is no session. Time accumulates in a ref and is flushed as a
 * self-contained tick once a minute, and the worst any of those failures can
 * cost is the seconds since the last tick. The flush on the way out is a
 * best-effort tidy-up of that remainder, not the mechanism — a mutation posted
 * during `pagehide` may well not make it, and nothing depends on it doing so.
 *
 * ## Only while you can see it
 *
 * The clock stops when the tab is hidden. An activity left in a background tab
 * overnight is not eleven hours of use, and counting it would make the one
 * number on the dashboard that is about effort into a number about how you
 * manage your tabs.
 */

/** How often the accrued seconds are sent. The server caps a single tick at
 *  five of these, so a machine that sleeps through a few loses the excess. */
const TICK_MS = 60_000;

export function ViewRecorder({ slug }: { slug: string }) {
  const { isAuthenticated } = useConvexAuth();
  const tzOffsetMinutes = useTzOffset();

  const record = useMutation(api.views.opened);
  const heartbeat = useMutation(api.views.heartbeat);

  /** The slug already counted, so a remount does not count it twice. The
   *  server has its own floor for the cases a ref cannot see — a refresh, or
   *  the reload button in the activity's own controls. */
  const opened = useRef<string | null>(null);

  /** Whole and part seconds watched but not yet sent. */
  const owed = useRef(0);
  /** When the current visible stretch began, or `null` while hidden. */
  const since = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    if (opened.current !== slug) {
      opened.current = slug;
      void record({ slug, tzOffsetMinutes });
    }

    // Closes the open stretch and opens a new one at the same instant, so no
    // time is lost or double-counted across a flush.
    const accrue = () => {
      if (since.current === null) return;
      const now = Date.now();
      owed.current += (now - since.current) / 1000;
      since.current = now;
    };

    // Only whole seconds go, and the fraction stays behind for the next tick.
    // Otherwise the rounding is paid on every flush and an hour of use is
    // reported as fifty-odd minutes.
    const flush = () => {
      accrue();
      const seconds = Math.floor(owed.current);
      if (seconds <= 0) return;
      owed.current -= seconds;
      void heartbeat({ slug, seconds, tzOffsetMinutes });
    };

    since.current = document.visibilityState === "visible" ? Date.now() : null;

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        since.current = Date.now();
        return;
      }
      // Flush rather than merely stop: a tab switched away from may never come
      // back, and this is the last moment the page is reliably alive.
      accrue();
      since.current = null;
      flush();
    };

    const onPageHide = () => {
      accrue();
      since.current = null;
      flush();
    };

    const timer = setInterval(flush, TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      // Navigating within the app — back to the catalogue, say — is the one
      // way out of here that does run, and it is the common one.
      onPageHide();
    };
  }, [isAuthenticated, slug, record, heartbeat, tzOffsetMinutes]);

  return null;
}
