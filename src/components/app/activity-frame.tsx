"use client";

import {
  PlaytimeGate,
  PlaytimeWarning,
  usePlaytimeGateQuota,
} from "./experience-quota";
import { useRef, useState, type ReactNode } from "react";
import { ActivityControls } from "@/components/app/activity-controls";
import styles from "@/components/app/activity-frame.module.css";
import {
  ACTIVITY_ALLOW,
  ACTIVITY_REFERRER_POLICY,
  ACTIVITY_SANDBOX,
} from "@/components/app/activity-sandbox";
import { PacketCover } from "@/components/app/packet-cover";
import { useStageFullscreen } from "@/components/app/use-stage-fullscreen";
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
 * a score, has to be written by code the framed document cannot reach.
 *
 * The edge blends the live embed through a narrow backdrop blur. It uses
 * the browser's compositing rather than sampling cross-origin pixels in JS,
 * so the colours always come from the displayed activity, not its thumbnail.
 *
 * The pill of controls is `ActivityControls`; what it controls is here.
 */
export function ActivityFrame(
  props: Parameters<typeof ActivityFrameContent>[0],
) {
  return (
    <PlaytimeGate placesWarning>
      <ActivityFrameContent {...props} />
    </PlaytimeGate>
  );
}

function ActivityFrameContent({
  title,
  src,
  variant = "activity",
  controls,
}: {
  title: string;
  src: string;
  variant?: "activity" | "tv";
  controls?: ReactNode;
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

  const { full, canFull, toggleFull } = useStageFullscreen(stage);

  // The controls wait out the loading cover and fade in as it lifts. Tracked
  // by the cover's key rather than a boolean, so a restart or a new `src`
  // hides them again without anything having to reset it.
  const coverKey = `cover-${src}-${run}`;
  const [liftedKey, setLiftedKey] = useState<string | null>(null);
  const ready = liftedKey === coverKey;
  const quota = usePlaytimeGateQuota();

  return (
    <div
      ref={stage}
      className="relative size-full overflow-hidden bg-[#111418]"
    >
      <div className="absolute inset-0">
        <iframe
          key={`${src}-${run}`}
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
          // never brings it any closer to the session. The lists themselves are
          // in `activity-sandbox.ts`, shared with `HostedActivity`.
          sandbox={
            variant === "tv"
              ? "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              : ACTIVITY_SANDBOX
          }
          allow={
            variant === "tv"
              ? "autoplay; fullscreen; encrypted-media; picture-in-picture"
              : ACTIVITY_ALLOW
          }
          referrerPolicy={ACTIVITY_REFERRER_POLICY}
          className="block size-full border-0"
        />
      </div>

      {!full && <div aria-hidden className={styles.edge} />}

      {/* Keyed on the same value as the frame, which is the whole of its
          scheduling: a restart tears both down together, so the cover is
          already black on the first frame of the new load rather than
          arriving an effect later. */}
      <PacketCover
        key={coverKey}
        onLift={() => setLiftedKey(coverKey)}
        detail={variant === "tv" ? "Getting your episode ready." : undefined}
        label={variant === "tv" ? "Entertainment" : undefined}
      />

      <div
        inert={!ready}
        className={cn(
          "pointer-events-none absolute top-3 right-3 left-3 z-20 flex flex-wrap items-start justify-end gap-2 transition-opacity duration-500 ease-out",
          ready ? "opacity-100" : "invisible opacity-0",
        )}
      >
        {controls && (
          <div className="pointer-events-auto flex items-center rounded-full border border-white/15 bg-black/55 p-1 text-white shadow-lg backdrop-blur-md">
            {controls}
          </div>
        )}
        <ActivityControls
          positioned={false}
          title={title}
          contentLabel={variant === "tv" ? "Entertainment" : "activity"}
          backHref={variant === "tv" ? "/tv" : undefined}
          backLabel={variant === "tv" ? "Back to Entertainment" : undefined}
          open={open}
          onToggle={() => setOpen((value) => !value)}
          onReload={() => setRun((value) => value + 1)}
          full={full}
          canFull={canFull}
          onToggleFull={toggleFull}
        />
      </div>

      {/* Inside the stage, so it stays visible in fullscreen. */}
      <PlaytimeWarning quota={quota} />
    </div>
  );
}
