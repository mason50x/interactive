"use client";

import { useEffect, useState } from "react";
import { RailConstellation } from "@/components/app/rail-constellation";
import { cn } from "@/lib/utils";

/** A softly lit loading interlude, remounted with each activity run. */
export function PacketCover({
  label = "Activity",
  holdMs = HOLD,
}: {
  detail?: string;
  label?: string;
  /** null keeps the cover visible until its parent finishes checking access. */
  holdMs?: number | null;
}) {
  const [phase, setPhase] = useState<Phase>("held");

  useEffect(() => {
    if (holdMs === null) return;
    const lift = window.setTimeout(() => setPhase("lifting"), holdMs);
    const gone = window.setTimeout(() => setPhase("gone"), holdMs + LIFT);
    return () => {
      window.clearTimeout(lift);
      window.clearTimeout(gone);
    };
  }, [holdMs]);

  if (phase === "gone") return null;

  return (
    <div
      // Under the control pill on purpose (it sits at `z-20`): the way back to
      // the activities list and the panic key's button both have to stay
      // reachable during a wait, and five seconds is long enough for someone
      // to want out of one.
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

      <span role="status" className="sr-only">
        {label} loading.
      </span>
    </div>
  );
}

type Phase = "held" | "lifting" | "gone";

// The hosted games have no shared ready event; retain the existing timed hold.
const LOGO_PATH = "M18 21H33.77V74.5H42.73V21H58.5V66.33H82V79H18Z";

const HOLD = 4600;
const LIFT = 400;
