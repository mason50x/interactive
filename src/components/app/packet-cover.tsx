"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/** A softly lit loading interlude, remounted with each activity run. */
export function PacketCover() {
  const [phase, setPhase] = useState<Phase>("held");

  // Which word is printed this time. The draw disagrees across the two renders
  // of it — the server's and the client's — so the word it picks is only shown
  // once the client has taken over, and the markup being hydrated against says
  // the first of them. Nobody has read a caption in the frame that takes.
  //
  // Held in state rather than drawn each render because the cover re-renders
  // when it starts lifting, and the word must not change on its way out. The
  // caller keys this on the run, so a restart is a remount and a fresh draw:
  // waiting twice in a row should at least not be the same wait twice.
  const [roll] = useState(Math.random);
  const shown = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const captionIndex = shown ? Math.floor(roll * CAPTIONS.length) : 0;
  const caption = CAPTIONS[captionIndex];

  useEffect(() => {
    const lift = window.setTimeout(() => setPhase("lifting"), HOLD);
    const gone = window.setTimeout(() => setPhase("gone"), HOLD + LIFT);
    return () => {
      window.clearTimeout(lift);
      window.clearTimeout(gone);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      // Under the control pill on purpose (it sits at `z-20`): the way back to
      // the activities list and the panic key's button both have to stay
      // reachable during a wait, and five seconds is long enough for someone
      // to want out of one.
      className={cn(
        "absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 packet-cover",
        // `pointer-events-none` only while it is going: until then the cover
        // is what swallows a click aimed at an activity that is not there yet.
        phase === "lifting" && "packet-reveal pointer-events-none",
      )}
    >
      <div className="packet-grid" aria-hidden="true">
        {Array.from({ length: 64 }, (_, row) => (
          <span
            key={row}
            className="packet-grid-row"
            style={{ animationDelay: `${row * -0.12}s` }}
          />
        ))}
      </div>
      <div className="packet-border packet-border-halo" aria-hidden="true" />
      <div className="packet-border" aria-hidden="true" />

      <p
        role="status"
        className="packet-caption text-shimmer text-[1.75rem] font-semibold"
      >
        {caption}<span className="sr-only">. Activity loading.</span>
      </p>
      <p className="packet-detail">Waiting for R2 response.</p>
    </div>
  );
}

type Phase = "held" | "lifting" | "gone";

/** There is nothing to subscribe to: the only transition this store has is
 *  the server snapshot giving way to the client one at hydration. */
const subscribeNever = () => () => {};

const CAPTIONS = ["Rummaging", "Brewing", "Conjuring", "Shuffling", "Tinkering", "Watering", "Unpacking"];

// The hosted games have no shared ready event; retain the existing timed hold.
const HOLD = 4600;
const LIFT = 400;
