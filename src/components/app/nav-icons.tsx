import { type ComponentProps, useId } from "react";

/**
 * The rail's solid icons, drawn in parts.
 *
 * Heroicons ships each solid glyph as one path, which is the right thing for
 * a glyph that never moves and the wrong thing for one that has to: nothing
 * in a single path can be nudged on its own. These are the same drawings —
 * Heroicons' own path data where a part could be lifted out of it whole, a
 * redraw to the set's rules where it could not — split along the seams the
 * hover animations need. A roof that lifts off its house is its own path; a
 * D-pad that presses is its own shape in a mask.
 *
 * The animations live in `globals.css` under "Rail icon microanimations" and
 * are keyed off `.nav-row:hover`, so what is here is geometry and the class
 * names the CSS reaches for. Nothing animates on its own.
 *
 * Masks are used where the moving part is a hole — a button in a controller,
 * a meridian on a globe. A hole in a single path is fixed to the path, so the
 * hole is instead drawn black over a white silhouette and the pair used to
 * mask a square of `currentColor`. Mask ids come from `useId`, stripped to
 * the characters a URL fragment likes, because a page can show the same icon
 * in the rail and in the header at once.
 */

type Props = ComponentProps<"svg">;

function useMaskId() {
  return `ni-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

/** The svg shell every icon shares. */
function Svg(props: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props} />
  );
}

/**
 * Home. Heroicons' `HomeModernIcon`, which already comes as two paths: the
 * roof slab with its chimney, and the house under it with the door cut out.
 * On hover the roof lifts and settles.
 */
export function HomeIconSolid(props: Props) {
  return (
    <Svg {...props}>
      <path
        className="ni-home-roof"
        d="M19.006 3.705a.75.75 0 0 0-.512-1.41L6 6.838V3a.75.75 0 0 0-.75-.75h-1.5A.75.75 0 0 0 3 3v4.93l-1.006.365a.75.75 0 0 0 .512 1.41l16.5-6Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.019 11.115 18 5.667v3.421l4.006 1.457a.75.75 0 1 1-.512 1.41l-.494-.18v8.475h.75a.75.75 0 0 1 0 1.5H2.25a.75.75 0 0 1 0-1.5H3v-9.129l.019-.007ZM18 20.25v-9.566l1.5.546v9.02H18Zm-9-6a.75.75 0 0 0-.75.75v4.5c0 .414.336.75.75.75h3a.75.75 0 0 0 .75-.75V15a.75.75 0 0 0-.75-.75H9Z"
      />
    </Svg>
  );
}

/**
 * Activities. A controller, masked so the D-pad and buttons are holes that
 * can move: on hover the D-pad nudges, the two buttons press in turn, and the
 * whole thing rumbles a hair.
 */
export function ControllerIconSolid(props: Props) {
  const id = useMaskId();
  return (
    <Svg {...props}>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <path
          fill="#fff"
          d="M8.25 6h7.5a6 6 0 0 1 5.95 5.4l.6 4.7a2.85 2.85 0 0 1-5.1 2.1L15.25 15.75h-6.5L6.8 18.2a2.85 2.85 0 0 1-5.1-2.1l.6-4.7A6 6 0 0 1 8.25 6Z"
        />
        <path
          className="ni-pad"
          fill="#000"
          d="M6.75 9.75h1.5v1.5h1.5v1.5h-1.5v1.5h-1.5v-1.5h-1.5v-1.5h1.5v-1.5Z"
        />
        <circle className="ni-btn-a" fill="#000" cx="15.75" cy="12.75" r="1" />
        <circle className="ni-btn-b" fill="#000" cx="18" cy="10.5" r="1" />
      </mask>
      <g className="ni-controller">
        <rect width="24" height="24" mask={`url(#${id})`} />
      </g>
    </Svg>
  );
}

/**
 * Chat. Heroicons' `ChatBubbleLeftRightIcon`, which is already two paths: the
 * bubble behind and the one in front. On hover they take turns — the back one
 * rises a touch, then the front one answers.
 */
export function ChatIconSolid(props: Props) {
  return (
    <Svg {...props}>
      <path
        className="ni-chat-back"
        d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 0 0-1.032-.211 50.89 50.89 0 0 0-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 0 0 2.433 3.984L7.28 21.53A.75.75 0 0 1 6 21v-4.03a48.527 48.527 0 0 1-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979Z"
      />
      <path
        className="ni-chat-front"
        d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 0 0 1.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0 0 15.75 7.5Z"
      />
    </Svg>
  );
}

/**
 * Experience. A globe, masked: a disc with the equator, two latitudes and the
 * front halves of five meridians cut out of it. Each meridian is the same
 * pole-to-pole arc scaled in x by the sine of its longitude, which is what a
 * meridian on a sphere projects to, so scaling that factor turns the globe.
 *
 * On hover it rolls a quarter turn: every meridian steps to its neighbour's
 * longitude, the one leaving over the limb fades and one arriving fades in,
 * and the frame it ends on is the frame it started from. The longitudes are
 * carried as custom properties so one keyframe set drives all five. Strokes
 * are `non-scaling` so a meridian near the middle is not drawn thinner than
 * one near the edge.
 */
export function GlobeIconSolid(props: Props) {
  const id = useMaskId();
  const arc = "M12 2.25A9.75 9.75 0 0 1 12 21.75";
  return (
    <Svg {...props}>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <circle cx="12" cy="12" r="9.75" fill="#fff" />
        <g
          fill="none"
          stroke="#000"
          strokeWidth="1.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        >
          <path d="M2.25 12h19.5" />
          <path d="M3.35 7.5h17.3" />
          <path d="M3.35 16.5h17.3" />
          <path className="ni-globe-m ni-globe-m1" d={arc} />
          <path className="ni-globe-m ni-globe-m2" d={arc} />
          <path className="ni-globe-m ni-globe-m3" d={arc} />
          <path className="ni-globe-m ni-globe-m4" d={arc} />
          <path className="ni-globe-m ni-globe-m5" d={arc} />
        </g>
      </mask>
      <rect width="24" height="24" mask={`url(#${id})`} />
    </Svg>
  );
}

/**
 * Simulators. Heroicons' `CpuChipIcon` redrawn as a package with its window
 * cut out, the die inside as its own square, and the twelve pins as their own
 * stubs. On hover the pins seat outward a hair, side by side around the
 * package, and the die blinks.
 */
export function ChipIconSolid(props: Props) {
  const pin = { rx: 0.75 };
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.75 3.75h10.5a3 3 0 0 1 3 3v10.5a3 3 0 0 1-3 3H6.75a3 3 0 0 1-3-3V6.75a3 3 0 0 1 3-3ZM6.75 6a.75.75 0 0 0-.75.75v10.5c0 .414.336.75.75.75h10.5a.75.75 0 0 0 .75-.75V6.75a.75.75 0 0 0-.75-.75H6.75Z"
      />
      <rect className="ni-die" x="7.5" y="7.5" width="9" height="9" />
      <g className="ni-pins-t">
        <rect x="7.5" y="2.25" width="1.5" height="2.25" {...pin} />
        <rect x="11.25" y="2.25" width="1.5" height="2.25" {...pin} />
        <rect x="15" y="2.25" width="1.5" height="2.25" {...pin} />
      </g>
      <g className="ni-pins-r">
        <rect x="19.5" y="7.5" width="2.25" height="1.5" {...pin} />
        <rect x="19.5" y="11.25" width="2.25" height="1.5" {...pin} />
        <rect x="19.5" y="15" width="2.25" height="1.5" {...pin} />
      </g>
      <g className="ni-pins-b">
        <rect x="7.5" y="19.5" width="1.5" height="2.25" {...pin} />
        <rect x="11.25" y="19.5" width="1.5" height="2.25" {...pin} />
        <rect x="15" y="19.5" width="1.5" height="2.25" {...pin} />
      </g>
      <g className="ni-pins-l">
        <rect x="2.25" y="7.5" width="2.25" height="1.5" {...pin} />
        <rect x="2.25" y="11.25" width="2.25" height="1.5" {...pin} />
        <rect x="2.25" y="15" width="2.25" height="1.5" {...pin} />
      </g>
    </Svg>
  );
}

/**
 * Philosophy. The brain from `brain-icon.tsx`, its two halves grouped apart
 * with their own folds so each can swell from the midline on its own. On
 * hover they think: left, then right.
 */
export function BrainIconSolid(props: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      fillOpacity={0.2}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <g className="ni-brain-l">
        <path d="M12 5a3 3 0 0 0-5.8-1A3.5 3.5 0 0 0 3 9a4 4 0 0 0 0 7 3.5 3.5 0 0 0 4 4 2.75 2.75 0 0 0 5-1.5Z" />
        <path
          fill="none"
          d="M6.2 4A3 3 0 0 0 7 7m-4 2a3 3 0 0 1 3 3m-3 4a3 3 0 0 0 3-2m1 6a3 3 0 0 1 1-4"
        />
      </g>
      <g className="ni-brain-r">
        <path d="M12 5a3 3 0 0 1 5.8-1A3.5 3.5 0 0 1 21 9a4 4 0 0 1 0 7 3.5 3.5 0 0 1-4 4 2.75 2.75 0 0 1-5-1.5Z" />
        <path
          fill="none"
          d="M17.8 4A3 3 0 0 1 17 7m4 2a3 3 0 0 0-3 3m3 4a3 3 0 0 1-3-2m-1 6a3 3 0 0 0-1-4"
        />
      </g>
    </svg>
  );
}

/**
 * The collapse glyph: a window with its left column marked off. Drawn here
 * because Heroicons has no sidebar, to the solid set's rules — 24 on the
 * grid, one filled frame with the pane cut out — so it sits beside the nav
 * rows' icons as one of them. The same glyph both ways: it names the thing
 * being moved, and the label says which way. Masked so the pane can move:
 * on hover it slides toward the side the rail is about to go, which is what
 * `data-to` on the button says.
 */
export function RailIconSolid(props: Props) {
  const id = useMaskId();
  return (
    <Svg {...props}>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect x="2.25" y="3.75" width="19.5" height="16.5" rx="3" fill="#fff" />
        <rect
          className="ni-rail-pane"
          x="9.75"
          y="5.25"
          width="10.5"
          height="13.5"
          rx="1.5"
          fill="#000"
        />
      </mask>
      <rect width="24" height="24" mask={`url(#${id})`} />
    </Svg>
  );
}
