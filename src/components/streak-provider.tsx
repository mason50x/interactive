"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { api } from "../../convex/_generated/api";

export type Streak = {
  current: number;
  best: number;
  countedToday: boolean;
};

/** `null` is "not known yet", which is not the same as a streak of zero. */
const StreakContext = createContext<Streak | null>(null);

export function useStreak() {
  return use(StreakContext);
}

/**
 * What the chip in the rail should be drawing right now.
 *
 * `display` overrides the subscription for the length of the ceremony and is
 * `null` the rest of the time, which is the chip's cue to go back to reading
 * the account's own number.
 */
export type StreakDisplay = {
  display: number | null;
  glowing: boolean;
};

const StreakDisplayContext = createContext<StreakDisplay>({
  display: null,
  glowing: false,
});

export function useStreakDisplay() {
  return use(StreakDisplayContext);
}

/** Must match `streak-zoom-in` in globals.css. */
const ZOOM_IN_MS = 620;
/** How long the rail is held close while the number turns over. */
const HOLD_MS = 900;
/** Must match `streak-zoom-out` in globals.css. */
const ZOOM_OUT_MS = 520;

/**
 * The claim, celebrated on the thing it changed.
 *
 * `in` is the app coming in towards the chip in the rail, `held` is the number
 * turning over and lighting up once it is close, `out` is the app going back
 * to where it was.
 */
type Ceremony = {
  /** The number on the chip before the claim — held until the zoom lands. */
  from: number;
  /** The number the chip turns over to. */
  to: number;
  /**
   * The move the shell makes. `null` means there is nothing to move towards —
   * no chip on screen, or an account that has asked for less motion — and the
   * ceremony is the number and the glow alone.
   */
  zoom: Zoom | null;
  phase: "in" | "held" | "out";
};

/**
 * A camera move: scale about the chip, and carry it to the middle of the
 * screen on the way.
 *
 * The carry is the whole difference between this and a magnifying glass. The
 * chip lives in the bottom corner of the rail, and scaling about it leaves it
 * in that corner — three times the size, with half of it past the edge of the
 * screen. `dx`/`dy` are how far that point has to travel to sit in the middle
 * of the viewport, in viewport pixels: the keyframes apply them after the
 * scale, so they are not multiplied by it.
 */
type Zoom = {
  /** The chip's centre, in the shell's own coordinates. */
  origin: string;
  dx: string;
  dy: string;
};

/**
 * Claims today for the signed-in account, and holds the answer for whatever
 * wants to draw it.
 *
 * Mounted in the dashboard layout rather than in `AppProviders`, which also
 * wraps the marketing site and the auth pages. Turning up to read the pricing
 * page is not a day's activity, and a streak claimed from `/auth` would be
 * claimed by a session that is halfway through being created.
 *
 * The claim is a single mutation on mount. Everything after that is the
 * subscription: the badge is reading `api.streaks.mine`, so it lights up when
 * the write lands, and it would light up just the same if the day had been
 * claimed in another tab.
 *
 * The celebration is deliberately not derived from the streak number going up.
 * A number changing under a subscription happens on every tab, on a reconnect,
 * and on a remount — the server instead says `extended` exactly once, on the
 * one call that moved it, and that is what starts the ceremony.
 *
 * That ceremony used to be an overlay in front of the app. It is now the app
 * itself: the shell scales in around the chip in the rail until the chip is
 * most of what you can see, the number turns over and flares, and the shell
 * pulls back out. Nothing new appears, nothing has to be dismissed, and the
 * thing celebrated is the thing that changed rather than a copy of it in the
 * middle of the screen.
 *
 * Scaling the shell means input has to stop for the two seconds it moves: a
 * rail at 3x is a column of buttons in places nobody aimed for, and a touch
 * that lands mid-zoom arrives somewhere the finger never was. Hence the
 * blocker below — the whole viewport, for the length of the ceremony, and
 * gone the moment it ends.
 */
export function StreakProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();

  // Read once and kept. This is a query argument, so a fresh value every
  // render would mean a fresh subscription every render. A tab left open
  // across a timezone change keeps the offset it started with, which is the
  // right trade for not tearing down a subscription to find out.
  const [tzOffsetMinutes] = useState(() => new Date().getTimezoneOffset());

  const streak = useQuery(
    api.streaks.mine,
    isAuthenticated ? { tzOffsetMinutes } : "skip",
  );
  const claimToday = useMutation(api.streaks.claimToday);

  /** The ceremony in flight, or `null` when the app is sitting still. */
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);

  /** The element that moves: everything under this provider. */
  const shell = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /**
   * The move the ceremony currently in flight is making, and `null` when there
   * is none. Kept out of state because it is only ever read by `celebrate`,
   * and read there for one reason: the chip cannot be measured while the shell
   * is mid-zoom — its box comes back already scaled and already carried, and a
   * ceremony measured off it would aim at somewhere the chip is not. So a
   * claim that lands on top of one still running goes where that one was
   * going. Rare, and cheaper to be right about than to detect.
   */
  const flight = useRef<{ zoom: Zoom | null } | null>(null);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const celebrate = useCallback((to: number) => {
    // A second claim on top of a running one takes the ceremony over rather
    // than queueing behind it: the timers from the first would otherwise put
    // the shell back while the second was still coming in.
    timers.current.forEach(clearTimeout);
    timers.current = [];

    const zoom = flight.current ? flight.current.zoom : zoomTo(shell.current);
    flight.current = { zoom };

    const inMs = zoom ? ZOOM_IN_MS : 0;
    const outMs = zoom ? ZOOM_OUT_MS : 0;

    const at = (ms: number, run: () => void) => {
      timers.current.push(setTimeout(run, ms));
    };

    setCeremony({ from: to - 1, to, zoom, phase: "in" });
    at(inMs, () => setCeremony((c) => (c ? { ...c, phase: "held" } : c)));
    at(inMs + HOLD_MS, () =>
      setCeremony((c) => (c ? { ...c, phase: "out" } : c)),
    );
    at(inMs + HOLD_MS + outMs, () => {
      flight.current = null;
      setCeremony(null);
    });
  }, []);

  const claimed = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || claimed.current) return;
    claimed.current = true;

    let retry: ReturnType<typeof setTimeout> | undefined;

    // `StoreUser` writes the row this counts against, and on a first ever
    // sign-in the two mount together — so this can arrive at a user that does
    // not exist yet. The server says so rather than inventing a row, and the
    // fix is to ask again in a moment. Three tries and then leave it: the next
    // page load claims the day, and a day claimed a navigation late is not
    // worth a poll that never stops.
    const claim = (attempt: number) => {
      void claimToday({ tzOffsetMinutes }).then((result) => {
        if (result.deferred) {
          if (attempt < 2) {
            retry = setTimeout(() => claim(attempt + 1), 800 * (attempt + 1));
          }
          return;
        }
        if (result.extended) celebrate(result.current);
      });
    };

    claim(0);

    // Only the pending timer. Deliberately no `cancelled` flag around the
    // response: this effect is torn down and re-run on every mount in
    // StrictMode, and a flag would have the second pass skip the claim (the
    // ref has already been taken) while the first pass throws its answer away
    // — which is a celebration that never appears in development and does in
    // production. A `celebrate` that lands after a real unmount is a no-op,
    // which is the cheaper of the two failures by a distance.
    return () => clearTimeout(retry);
  }, [isAuthenticated, claimToday, tzOffsetMinutes, celebrate]);

  // Before the zoom lands the chip is still on the old number, even if the
  // subscription has already brought the new one back; after it, on the new
  // one whether or not the subscription has caught up. `null` outside a
  // ceremony, which hands the chip back to its own subscription.
  const display = ceremony
    ? ceremony.phase === "in"
      ? ceremony.from
      : ceremony.to
    : null;

  const zooming = ceremony?.zoom != null;

  return (
    <StreakContext value={streak ?? null}>
      <StreakDisplayContext
        value={{
          display,
          glowing: ceremony !== null && ceremony.phase !== "in",
        }}
      >
        {/* The stage, in the chrome's own colour and clipped, both only while
            the shell inside it is moving.

            Clipped because a transform still contributes scrollable overflow
            to the document, and a viewport-sized thing at 3x would hand the
            page a scrollbar it has never had — a jump sideways, mid-zoom, on
            every platform that gives its scrollbars a width.

            Coloured because carrying the chip to the middle of the screen
            moves the shell off two edges of the viewport, and something has to
            be under there. `--sidebar` is the right nothing: every outermost
            pixel of the shell is already that colour — the rail on the left,
            the margin around the shell everywhere else — so the seam does not
            read as a seam. */}
        <div
          className={
            ceremony !== null ? "overflow-clip bg-sidebar" : undefined
          }
        >
          {/* The shell, and the only thing that moves. A `transform` makes
              this the containing block for any `fixed` descendant under it,
              which is why it carries no class and no style between
              ceremonies — pinning the app's fixed children to this div the
              rest of the time would be a bug looking for somewhere to
              happen. */}
          <div
            ref={shell}
            style={
              ceremony?.zoom
                ? ({
                    transformOrigin: ceremony.zoom.origin,
                    "--streak-dx": ceremony.zoom.dx,
                    "--streak-dy": ceremony.zoom.dy,
                  } as CSSProperties)
                : undefined
            }
            className={
              zooming
                ? ceremony?.phase === "out"
                  ? "streak-zoom-out"
                  : "streak-zoom-in"
                : undefined
            }
          >
            {children}
          </div>
        </div>
      </StreakDisplayContext>

      {/* Input, stopped. Outside the shell so it is not scaled with it, and
          `touch-none` as well as opaque to pointers, because a scroll gesture
          is not a click and would otherwise still reach the page beneath. */}
      {ceremony !== null && (
        <div
          aria-hidden
          className="fixed inset-0 z-[60] cursor-default touch-none"
        />
      )}
    </StreakContext>
  );
}

/**
 * The move that brings the chip to the middle of the screen, measured in the
 * shell's own coordinates.
 *
 * Measured when the ceremony starts and never before: the rail is a different
 * width above and below `lg`, and the chip is not rendered at all in the
 * collapsed one. `null` covers every reason there is nothing to move towards —
 * no chip in the tree, a chip with no box because the half of the rail it sits
 * in is hidden, or an account that has asked for less motion, for whom a shell
 * that jumps to 3x and back inside two frames (the rule at the foot of
 * globals.css collapses the animation, it does not remove it) is not a quieter
 * version of this but a worse one.
 */
function zoomTo(shell: HTMLDivElement | null): Zoom | null {
  if (!shell) return null;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return null;
  }

  const chip = document.querySelector("[data-streak-badge]");
  if (!chip) return null;

  const box = chip.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;

  // Both the chip and the target are read off the viewport and then put into
  // the shell's frame, because that is the space `transform-origin` is in.
  const frame = shell.getBoundingClientRect();
  const x = box.left + box.width / 2 - frame.left;
  const y = box.top + box.height / 2 - frame.top;

  return {
    origin: `${Math.round(x)}px ${Math.round(y)}px`,
    dx: `${Math.round(window.innerWidth / 2 - frame.left - x)}px`,
    dy: `${Math.round(window.innerHeight / 2 - frame.top - y)}px`,
  };
}
