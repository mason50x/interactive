"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useInvites } from "@/components/app/invite-card";
import { RailConstellation } from "@/components/app/rail-constellation";
import { cn } from "@/lib/utils";

/**
 * The first five seconds of an account.
 *
 * Shown once, on the arrival that follows signing in — never on a return visit
 * — so like the streak celebration it is a screen that appears without anybody
 * asking for it, and it behaves accordingly: it takes no focus, traps none,
 * blocks nothing a click or Escape cannot clear, and leaves on its own whether
 * or not anyone touches it. `WelcomeProvider` decides whether it is owed; this
 * only knows how to play.
 *
 * The shape of the thing is one sentence long. The screen goes flat, a lock
 * the size of your hand turns up in the middle of it, strains, gives, and
 * comes apart into the constellation — and then the app is behind it again,
 * with the invitations you are holding named on the way past.
 *
 * ## The ground, and the absence of glow
 *
 * One solid colour, `--background`, which is the app's own page ground: near
 * white under the light theme and near black under the dark one. Not a scrim
 * over the dashboard — nothing shows through, there is no blur, and there is
 * no coloured light anywhere in it. The lock is a flat silhouette in
 * `--foreground` and the constellation reads its ink off the canvas, so the
 * whole scene inverts with the theme the way the rest of the app does.
 *
 * ## Why it is built in layers
 *
 * Four things animate `transform` at once — the arrival, the rattle, the
 * shackle's swing and the shatter — and an element has one `transform`. So
 * they are nested rather than combined: the stage scales, the shake inside it
 * translates and rotates, and the shackle inside *that* swings about its own
 * hinge. Collapse any two into one element and the later animation simply
 * takes the property.
 *
 * ## Why the burst is a canvas and the lock is not
 *
 * The lock is one drawing that moves as a unit, which is four CSS animations
 * on four nodes. The constellation is a hundred-odd points whose *edges* are
 * recomputed every frame, which is not something the DOM should be asked to
 * hold.
 *
 * It is `RailConstellation` — the same field that is behind the rail and
 * behind the sign-in form, given a `burstFrom` and nothing else. That is worth
 * more than it looks: the arrangement the lock comes apart into is not a
 * one-off scatter that resembles the app's constellation, it *is* the app's
 * constellation, seeded at its usual density and arriving by flying out of the
 * lock instead of by already being there. When it lands it keeps drifting, and
 * it answers the cursor, because it never stopped being that component.
 *
 * ## Reduced motion
 *
 * Not a quieter version of the same thing: a different one. The blanket rule
 * in `globals.css` collapses every animation to an instant, which would leave
 * the lock jumping straight to shattered and the burst never travelling — a
 * blank screen with two lines on it. So the strain and the burst are dropped
 * in *this* file instead, and what is left is the lock, open, with the same
 * words under it. The whole sequence is also shorter, because none of the time
 * was ever for reading.
 */

/**
 * The beats, in milliseconds from mount, and the two schedules they run on.
 *
 * They are a table rather than a chain of nested timeouts because every one of
 * them has a CSS duration on the other side that has to line up with it: the
 * strain is handed to the stylesheet as `--strain-ms`, and `settled` has to
 * land after the shackle's 0.44s swing rather than during it.
 */
const SCHEDULE = {
  motion: { strain: 620, open: 1520, settle: 1980, hold: 5100 },
  still: { strain: null, open: 240, settle: 660, hold: 3900 },
} as const;

/** How long the lock strains for. Must match `--strain-ms` below, which is
 *  what `lock-rattle` is stretched to. */
const STRAIN_MS = SCHEDULE.motion.open - SCHEDULE.motion.strain;

/** Must match `unlock-leave` in globals.css. */
const LEAVE_MS = 480;

type Phase = "arriving" | "straining" | "opening" | "settled";

export function WelcomeUnlock({ onDismiss }: { onDismiss: () => void }) {
  // Read once, at mount, and never watched for changes. A preference toggled
  // halfway through a five-second animation is not a case worth restarting an
  // animation for, and re-running the schedule on it would be worse than
  // either answer.
  const [motion] = useState(
    () =>
      typeof window === "undefined" ||
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const [phase, setPhase] = useState<Phase>("arriving");
  const [leaving, setLeaving] = useState(false);

  /**
   * Where the lock was when it went, in viewport coordinates.
   *
   * Measured rather than assumed. The lock and the words are one centred
   * column, so the lock is not at the middle of the screen — it is above it by
   * half the caption — and a burst that leaves from the middle of the screen
   * leaves from somewhere the lock never was. Read once, in the same callback
   * that shatters it, which is the last frame it is still there to measure.
   */
  const lockRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  const invites = useInvites();
  const remaining = invites?.remaining ?? 0;

  // Starts the exit rather than cutting to it, so a click and the timer both
  // land on the same motion. Escape is the exception — see below.
  const leave = useCallback(() => {
    setLeaving(true);
    setTimeout(onDismiss, LEAVE_MS);
  }, [onDismiss]);

  useEffect(() => {
    const beats = motion ? SCHEDULE.motion : SCHEDULE.still;

    const timers = [
      beats.strain === null
        ? null
        : setTimeout(() => setPhase("straining"), beats.strain),
      setTimeout(() => setPhase("opening"), beats.open),
      setTimeout(() => {
        const box = lockRef.current?.getBoundingClientRect();
        if (box) {
          setOrigin({
            x: box.left + box.width / 2,
            y: box.top + box.height / 2,
          });
        }
        setPhase("settled");
      }, beats.settle),
      setTimeout(leave, beats.hold),
    ];

    // Escape unmounts outright rather than fading. Someone reaching for it is
    // telling you they want the screen back, and half a second of politeness
    // is the wrong answer to that.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      for (const timer of timers) if (timer !== null) clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [motion, leave, onDismiss]);

  const settled = phase === "settled";
  // Under reduced motion the lock is never destroyed; it just ends up open.
  const shattered = settled && motion;
  const open = phase === "opening" || settled;
  // The rattle is kept on past the phase that started it. It fills `both`, so
  // the class is what holds the lock at the size it strained up to — pull it
  // at `opening` and the lock visibly shrinks back a frame before the shackle
  // gives.
  const strained = phase !== "arriving";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-[70] flex items-center justify-center px-6",
        leaving && "animate-unlock-leave",
      )}
      style={{ "--strain-ms": `${STRAIN_MS}ms` } as CSSProperties}
    >
      {/* The ground, and the way out. A real button rather than a handler on
          a div: it is the only control here and it has to be reachable by a
          keyboard that never sees the Escape listener.

          Fully opaque, and `--background` rather than a tinted panel: the app
          goes away for five seconds rather than sitting dimmed behind frosted
          glass. It fades in rather than cutting, so the page is covered rather
          than replaced. */}
      <button
        type="button"
        aria-label="Skip"
        onClick={leave}
        className="animate-unlock-scrim absolute inset-0 cursor-default bg-background"
      />

      {/* Mounted at the burst and not before, so the flight starts on the
          frame the lock comes apart rather than three seconds earlier with
          nobody watching.

          `z-0` overrides the component's own `-z-10`, which is right for the
          rail — where it belongs behind everything — and wrong here, where
          everything behind it is the opaque ground above. Denser than the
          rail's default and denser than the sign-in page's, because this is
          the only thing on the screen and it has a whole viewport to fill. */}
      {shattered && origin !== null && (
        <RailConstellation
          burstFrom={origin}
          areaPerPoint={9000}
          maxPoints={120}
          className="z-0 [--web-fade:0.62] dark:[--web-fade:0.56]"
        />
      )}

      <div className="pointer-events-none relative flex flex-col items-center">
        <div className="relative flex size-72 items-center justify-center sm:size-[26rem]">
          {/* The latch letting go: one ring at one moment, not a pulse. This
              is a mechanism releasing.

              Mounted from `opening` *onwards* rather than during it. The ring
              takes 0.9s to travel and the phase it starts in is 460ms long, so
              gating it on that phase alone cut it off halfway out — a hoop
              that vanished mid-expansion, every time. */}
          {open && motion && (
            <span
              aria-hidden
              className="unlock-ring absolute size-60 rounded-full border-2 border-foreground/40"
            />
          )}

          <div
            ref={lockRef}
            className="lock-stage relative text-foreground"
            data-phase={shattered ? "burst" : phase}
          >
            <div className={cn(motion && strained && "lock-shake")}>
              <Padlock open={open} />
            </div>
          </div>
        </div>

        {/* Rendered from the first frame and merely hidden, not mounted at the
            burst. It is part of a centred column, so a block that appeared
            late would shorten the column, shove the lock upwards, and do it in
            the very frame the lock is supposed to be coming apart — a jump of
            about seventy pixels, at the one moment nobody should be looking
            anywhere else. `invisible` keeps the height and gives it up to the
            entrance when there is finally something to read.

            `animate-rise-in` is the app's own entrance — the same one the
            marketing sections use — held back with a delay rather than given
            a second keyframe of its own. */}
        <div
          aria-hidden={!settled}
          className={cn(
            "-mt-4 flex flex-col items-center",
            settled ? "animate-rise-in [animation-delay:220ms]" : "invisible",
          )}
        >
          <p className="text-display text-[3.25rem] text-foreground sm:text-[5rem]">
            You&rsquo;re in
          </p>

          {/* Fades in whenever Convex answers, which is usually before the
              heading arrives and occasionally after. Rendered as an empty slot
              in the meantime rather than appended late, so the block does not
              grow a line under someone who has already started reading. */}
          <p
            className={cn(
              "mt-4 min-h-[1.625rem] text-[1.0625rem] text-muted-foreground transition-opacity duration-500",
              remaining > 0 ? "opacity-100" : "opacity-0",
            )}
          >
            {remaining > 0 && (
              <>
                You can also invite {remaining}{" "}
                {remaining === 1 ? "person" : "people"}.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The lock itself.
 *
 * Drawn rather than pulled from Heroicons, which is the icon set everywhere
 * else in this app: those are 24px glyphs with the weight and the corner radii
 * of a 24px glyph, and this one is rendered at twenty times that. Blown up,
 * the shackle reads as a hairline and the body as a rounded square.
 *
 * The shackle is drawn *before* the body so its legs run behind it, which is
 * what lets it swing without its foot appearing from under the case. It is
 * also the only part that moves, and it moves about the foot of its right leg
 * — stated in the SVG's own user units, which only works because the class
 * sets `transform-box: view-box`. Left at the default, the origin is the top
 * left of the whole drawing and the shackle swings out of frame.
 */
function Padlock({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden className="size-52 sm:size-72">
      <path
        // Only carries the animation class when it has somewhere to go.
        // `both` holds the end state, so a shackle that mounted with it would
        // start the sequence already open.
        className={open ? "unlock-shackle" : undefined}
        d="M 31 43 V 32 a 17 17 0 0 1 34 0 V 43"
        fill="none"
        stroke="currentColor"
        strokeWidth="11"
        strokeLinecap="round"
      />

      {/* Flat, one colour, no gradient and no shadow under it. A lit surface
          would be the only lit thing on a screen that is otherwise a single
          flat tone, and it read as a glow rather than as a lock. The legs stop
          two units inside the case rather than at its lip, so the shackle is
          seated in the body instead of balanced on it. */}
      <rect
        x="13"
        y="41"
        width="70"
        height="48"
        rx="13"
        fill="currentColor"
      />

      {/* The keyhole is a hole: painted in the ground's own colour, so it
          reads as the case being open all the way through rather than as a
          dark shape sitting on it. */}
      <circle cx="48" cy="60" r="6.5" fill="var(--background)" />
      <path d="M 45 63.5 L 43.4 76 h 9.2 L 51 63.5 Z" fill="var(--background)" />
    </svg>
  );
}
