"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * The five seconds of black in front of an activity that is still loading.
 *
 * A bundle on the asset origin is tens of megabytes of WebAssembly and save
 * data, and until it has all of it the frame is an empty white rectangle that
 * looks like a page that failed. Nothing in here can be measured — the
 * document two frames down is cross-origin, so there is no `load` event to
 * wait on and no progress to read — which means the cover cannot be honest
 * about how far along the load is. What it can be is *certain*: a fixed five
 * seconds, the same every time, with something to watch.
 *
 * So it is a joke rather than a progress bar. A man runs from the rack to the
 * laptop with an armful of paper, and the caption underneath names some errand
 * he is plainly not on. Nobody believes the network is percolating, which is
 * the point — a fake bar creeping to 90% is a lie about progress, and this is
 * not pretending to be one.
 *
 * ## The mount is the trigger
 *
 * There is no `run` prop and no effect watching one. The caller keys this on
 * the same value it keys the frame on, so a restart remounts both together and
 * the cover starts held from its own first render — no frame in which the
 * reloading iframe is visible before the black arrives.
 */
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
  const caption = CAPTIONS[shown ? Math.floor(roll * CAPTIONS.length) : 0];

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
        "absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black",
        "transition-opacity duration-400 ease-out",
        // `pointer-events-none` only while it is going: until then the cover
        // is what swallows a click aimed at an activity that is not there yet.
        phase === "lifting" && "pointer-events-none opacity-0",
      )}
    >
      <PacketScene />

      {/* Announced, not just drawn. A screen reader gets no help at all from
          the picture, and "the thing you asked for is loading" is the only
          part of this that is information.

          The same shimmer the handle search uses, in the cover's own two
          colours — see `.packet-caption`. It is doing the job it always does:
          saying the wait is still alive without claiming to know how far in
          it is. */}
      <p
        role="status"
        className="packet-caption text-shimmer text-[1.75rem] font-semibold"
      >
        {caption}
      </p>
    </div>
  );
}

type Phase = "held" | "lifting" | "gone";

/** There is nothing to subscribe to: the only transition this store has is
 *  the server snapshot giving way to the client one at hydration. */
const subscribeNever = () => () => {};

/**
 * One word each, and none of them true.
 *
 * A caption that described the load would be a claim about it, and there is
 * nothing here to measure — so these describe something else entirely and let
 * the reader do the arithmetic. They are single words on purpose: the caption
 * is 28px under a drawing, and anything longer wraps on a phone and stops
 * being a punchline. Keep new ones to one word, present tense, and obviously
 * not networking.
 */
const CAPTIONS = [
  "Cooking",
  "Computing",
  "Percolating",
  "Marinating",
  "Rummaging",
  "Simmering",
  "Whittling",
  "Untangling",
  "Conjuring",
  "Herding",
  "Tinkering",
  "Brewing",
  "Noodling",
  "Unpacking",
  "Wrangling",
  "Shuffling",
  "Assembling",
  "Summoning",
  "Reticulating",
  "Ruminating",
];

/** Black for this long, then 400ms of fade — five seconds end to end, which is
 *  the number the cover promises and so the number these two must add up to. */
const HOLD = 4600;
const LIFT = 400;

/**
 * The errand, drawn once and run twice.
 *
 * A rack on the left, a laptop on the right, and a courier crossing between
 * them every 2.5s — so the cover holds exactly two trips and never cuts a
 * third one off halfway. All of the motion is `transform` and `opacity` on a
 * dozen elements, so five seconds of this stays on the compositor while the
 * main thread is busy doing the thing it is covering for.
 *
 * The limbs are lines rotating about their own joints, which SVG will only do
 * once `transform-box: fill-box` moves each one's origin off the corner of the
 * viewBox and onto its own bounding box — see `.packet-limb` in `globals.css`.
 * The figure is drawn standing at the origin with its feet at y=0, so every
 * joint is a negative y and the rotations read the way a hip and a shoulder do.
 */
function PacketScene() {
  return (
    <svg
      viewBox="0 0 260 130"
      className="packet-scene w-[min(17rem,52%)] text-white"
      aria-hidden
    >
      {/* The floor both machines stand on. Faint, because its whole job is to
          stop the three drawings from floating at unrelated heights. */}
      <line
        x1="16"
        y1="104"
        x2="256"
        y2="104"
        stroke="currentColor"
        strokeOpacity="0.16"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* The rack. Four blank sleds and four lights, which is as much server as
          anyone needs to recognise one at this size. */}
      <g>
        <rect
          x="16"
          y="22"
          width="40"
          height="82"
          rx="4"
          fill="currentColor"
          fillOpacity="0.06"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeWidth="2"
        />
        {[30, 46, 62, 78].map((y, index) => (
          <g key={y}>
            <rect
              x="22"
              y={y}
              width="22"
              height="10"
              rx="2"
              fill="currentColor"
              fillOpacity="0.12"
            />
            <circle
              cx="49"
              cy={y + 5}
              r="1.9"
              fill="currentColor"
              className="packet-led"
              // Prime-ish fractions of the blink, so the four lights never
              // fall into a rhythm and start reading as one flashing bar.
              style={{ animationDelay: `${index * 0.29}s` }}
            />
          </g>
        ))}
      </g>

      {/* The laptop, lid up and facing the rack. */}
      <g>
        <rect
          x="198"
          y="60"
          width="46"
          height="34"
          rx="3"
          fill="currentColor"
          fillOpacity="0.06"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeWidth="2"
        />
        {/* The delivery landing. One short flash inside the screen, timed
            against the crossing below rather than looping on its own clock —
            the arrival is the only moment in the loop worth marking. */}
        <rect
          x="203"
          y="65"
          width="36"
          height="24"
          rx="2"
          fill="currentColor"
          className="packet-flash"
        />
        <path
          d="M192 94h58l6 10H186z"
          fill="currentColor"
          fillOpacity="0.14"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>

      {/* The courier. The outer group is the crossing; the inner one puts the
          figure's feet on the floor at the rack, so everything inside is drawn
          in the man's own coordinates and knows nothing about the trip. */}
      <g className="packet-runner">
        <g transform="translate(74 104)">
          <g className="packet-body">
            {/* Legs. The back one is half a stride behind — one animation,
                two delays, rather than two sets of keyframes to keep in step. */}
            <line
              className="packet-limb packet-leg"
              x1="0"
              y1="-16"
              x2="0"
              y2="0"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeOpacity="0.55"
            />
            <line
              className="packet-limb packet-leg packet-behind"
              x1="0"
              y1="-16"
              x2="0"
              y2="0"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Torso, leaning into the run, and the head on top of it. */}
            <line
              x1="0"
              y1="-16"
              x2="2"
              y2="-33.5"
              stroke="currentColor"
              strokeWidth="3.4"
              strokeLinecap="round"
            />
            <circle cx="4" cy="-38" r="5" fill="currentColor" />

            {/* The trailing arm, swinging opposite the leading leg. */}
            <line
              className="packet-limb packet-arm"
              x1="1"
              y1="-30"
              x2="1"
              y2="-21"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeOpacity="0.6"
            />

            {/* The paper. Held out front on a stiff arm — the one limb that
                does not swing, because the whole gag is that he is being
                careful with it — bobbing with the stride instead. */}
            <g className="packet-carry">
              <line
                x1="1"
                y1="-30"
                x2="10"
                y2="-26"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <g transform="rotate(-8 16 -30)">
                <rect
                  x="9"
                  y="-35"
                  width="14"
                  height="11"
                  rx="1.5"
                  fill="currentColor"
                  fillOpacity="0.9"
                />
                <line
                  x1="11.5"
                  y1="-31.5"
                  x2="20.5"
                  y2="-31.5"
                  stroke="#000"
                  strokeOpacity="0.55"
                  strokeWidth="1.4"
                />
                <line
                  x1="11.5"
                  y1="-28.5"
                  x2="18"
                  y2="-28.5"
                  stroke="#000"
                  strokeOpacity="0.55"
                  strokeWidth="1.4"
                />
              </g>
            </g>

            {/* Two sheets he is losing on the way, which is what sells the
                armful as more paper than one man should be carrying. */}
            <rect
              className="packet-sheet"
              x="-14"
              y="-32"
              width="9"
              height="7"
              rx="1"
              fill="currentColor"
              fillOpacity="0.75"
            />
            <rect
              className="packet-sheet packet-behind"
              x="-23"
              y="-24"
              width="7"
              height="6"
              rx="1"
              fill="currentColor"
              fillOpacity="0.55"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
