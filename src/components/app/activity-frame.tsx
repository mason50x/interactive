"use client";

import { useCallback, useRef, useState } from "react";
import { ActivityControls } from "@/components/app/activity-controls";
import styles from "@/components/app/activity-frame.module.css";
import {
  ACTIVITY_ALLOW,
  ACTIVITY_REFERRER_POLICY,
  ACTIVITY_SANDBOX,
} from "@/components/app/activity-sandbox";
import { PacketCover } from "@/components/app/packet-cover";
import { useStageFullscreen } from "@/components/app/use-stage-fullscreen";
import { usePreferences } from "@/components/preferences-provider";
import { safePanicUrl } from "@/lib/preferences";

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
 *
 * The edge blends the live embed through a narrow backdrop blur. It uses
 * the browser's compositing rather than sampling cross-origin pixels in JS,
 * so the colours always come from the displayed activity, not its thumbnail.
 *
 * The pill of controls is `ActivityControls`; what it controls is here.
 */
export function ActivityFrame({ title, src }: { title: string; src: string }) {
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

  /**
   * The panic key's way in, for the one place the key itself cannot reach.
   *
   * Keystrokes inside an activity belong to the bundle's document, which is
   * cross-origin two frames down — `usePanicKey` listens on this window and
   * will never be told about them. Outside fullscreen that is survivable,
   * because any click on the app around the frame hands focus back. In
   * fullscreen there is no app around the frame, so once someone is playing
   * the key is gone until they leave, which is exactly the stretch they were
   * most likely thinking of when they set one.
   *
   * So the control pill carries the same destination as a button. It is inside
   * `stage`, which is the element that goes fullscreen, so it survives the one
   * case it exists for.
   */
  const { preferences } = usePreferences();
  const panicUrl = preferences.panicEnabled
    ? safePanicUrl(preferences.panicUrl)
    : null;

  // `replace`, matching the key: the page you were on should not be one Back
  // press away. The browser drops fullscreen on its own as the document goes.
  const onPanic = useCallback(() => {
    if (panicUrl) window.location.replace(panicUrl);
  }, [panicUrl]);

  const { full, canFull, toggleFull } = useStageFullscreen(stage);

  return (
    <div
      ref={stage}
      className="relative size-full overflow-hidden bg-[#111418]"
    >
      <div className="absolute inset-0">
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
          // never brings it any closer to the session. The lists themselves are
          // in `activity-sandbox.ts`, shared with `HostedActivity`.
          sandbox={ACTIVITY_SANDBOX}
          allow={ACTIVITY_ALLOW}
          referrerPolicy={ACTIVITY_REFERRER_POLICY}
          className="block size-full border-0"
        />
      </div>

      {!full && <div aria-hidden className={styles.edge} />}

      {/* Keyed on the same value as the frame, which is the whole of its
          scheduling: a restart tears both down together, so the cover is
          already black on the first frame of the new load rather than
          arriving an effect later. */}
      <PacketCover key={`cover-${run}`} />

      <ActivityControls
        title={title}
        open={open}
        onToggle={() => setOpen((value) => !value)}
        onReload={() => setRun((value) => value + 1)}
        full={full}
        canFull={canFull}
        onToggleFull={toggleFull}
        onPanic={panicUrl ? onPanic : null}
      />
    </div>
  );
}
