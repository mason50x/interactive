"use client";

import { useEffect, useState } from "react";
import { RailConstellation } from "@/components/app/rail-constellation";
import { cn } from "@/lib/utils";

/** A softly lit loading interlude, remounted with each activity run. */
export function PacketCover({
  label = "Activity",
  holdMs = HOLD,
  onLift,
}: {
  detail?: string;
  label?: string;
  /** null keeps the cover visible until its parent finishes checking access. */
  holdMs?: number | null;
  /** Called as the cover starts lifting, when the embed is about to show. */
  onLift?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("held");
  const [queueMessage, setQueueMessage] = useState(QUEUE_MESSAGES[0]);

  useEffect(() => {
    if (holdMs === null) return;
    const lift = window.setTimeout(() => {
      setPhase("lifting");
      onLift?.();
    }, holdMs);
    const gone = window.setTimeout(() => setPhase("gone"), holdMs + LIFT);
    return () => {
      window.clearTimeout(lift);
      window.clearTimeout(gone);
    };
    // `onLift` is left out on purpose: a new callback identity each render
    // must not restart the hold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdMs]);

  useEffect(() => {
    if (holdMs === null) return;
    const randomize = window.setTimeout(() => {
      setQueueMessage(
        QUEUE_MESSAGES[Math.floor(Math.random() * QUEUE_MESSAGES.length)],
      );
    }, 0);
    return () => window.clearTimeout(randomize);
  }, [holdMs]);

  if (phase === "gone") return null;

  return (
    <div
      // Under the control pill (it sits at `z-20`), which the activity frame
      // holds back until `onLift` and then fades in over the reveal.
      className={cn(
        "packet-cover absolute inset-0 z-10 flex flex-col items-center justify-center gap-3",
        // `pointer-events-none` only while it is going: until then the cover
        // is what swallows a click aimed at an activity that is not there yet.
        phase === "lifting" && "packet-reveal pointer-events-none",
      )}
    >
      <div className="packet-constellation" aria-hidden="true">
        <RailConstellation
          maxPoints={54}
          areaPerPoint={11000}
          className="z-0 [--web-fade:0.28] dark:[--web-fade:0.32]"
        />
      </div>
      <svg className="packet-logo" viewBox="0 0 160 160" aria-hidden="true">
        <circle
          className="packet-logo-ring"
          cx="80"
          cy="80"
          r="70"
          pathLength="432"
        />
        <path
          className="packet-logo-mark"
          d={LOGO_PATH}
          transform="translate(34 28)"
        />
      </svg>

      {holdMs !== null && (
        <span
          aria-hidden="true"
          className="text-shimmer relative text-center text-sm font-medium"
        >
          {queueMessage}
        </span>
      )}

      <span role="status" className="sr-only">
        {label} loading.
      </span>
    </div>
  );
}

type Phase = "held" | "lifting" | "gone";

// The hosted games have no shared ready event; retain the existing timed hold.
const LOGO_PATH = "M18 21H33.77V74.5H42.73V21H58.5V66.33H82V79H18Z";

const QUEUE_MESSAGES = [
  "You're 2nd in line…",
  "You're up next…",
  "Saving your spot…",
  "Getting your seat ready…",
];

const HOLD = 3500;
const LIFT = 400;
