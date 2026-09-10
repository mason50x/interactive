import type { CSSProperties } from "react";

/**
 * The resting panel of the rail's search, and the orb that sits in it.
 *
 * Split out of `RailSearch` because the two have nothing to say to each
 * other: the search owns a query, a listbox and a shortcut, and this owns
 * fifty dots placed once at module load. What crosses the line is nothing —
 * `Resting` takes no props — which is the whole case for the file.
 */

/**
 * Where the orb's dots sit: one ring per latitude, and how many are on it.
 *
 * Counts fall off towards the poles roughly as the circumference does, which
 * is what keeps the spacing even over the surface — equal counts per ring
 * would crowd the top and bottom into two tight knots. Latitudes stop short of
 * ±90 so there is no dot exactly on the axis; a pole dot does not move as the
 * sphere turns, and one stationary point in the middle of fifty moving ones is
 * the thing your eye goes to.
 */
const ORB_RINGS = [
  { lat: 74, count: 4 },
  { lat: 45, count: 9 },
  { lat: 15, count: 12 },
  { lat: -15, count: 12 },
  { lat: -45, count: 9 },
  { lat: -74, count: 4 },
] as const;

/**
 * The eight brightness levels a dot steps through in one revolution, starting
 * with it facing the camera. Mirrored around the halfway point because the
 * back of a sphere is the front of it seen later — see `pixel-orb-face` in
 * `globals.css`, which is these numbers as keyframes.
 */
const ORB_LEVELS = [1, 0.85, 0.6, 0.38, 0.2, 0.38, 0.6, 0.85];

/**
 * Every dot, placed and timed once at module load.
 *
 * `phase` is the fraction of a revolution at which this dot faces the camera —
 * a dot at longitude L gets there when the shell has turned by -L — and is
 * what the CSS turns into an `animation-delay`. `rest` is the level that phase
 * lands on at rotation zero, written onto the dot as its plain `opacity` so
 * that a sphere with its animations collapsed is still a *shaded* sphere.
 *
 * Alternate rings are offset by half a step, so the dots do not line up into
 * vertical columns that flicker as they cross the silhouette.
 */
const ORB_DOTS = ORB_RINGS.flatMap(({ lat, count }, ring) =>
  Array.from({ length: count }, (_, index) => {
    const lon = (360 / count) * (index + (ring % 2 === 1 ? 0.5 : 0));
    const phase = (((-lon / 360) % 1) + 1) % 1;
    return {
      lat,
      lon,
      phase,
      rest: ORB_LEVELS[Math.floor(((1 - phase) % 1) * ORB_LEVELS.length)],
    };
  }),
);

/**
 * The panel before anything has been typed.
 *
 * It exists to answer the question the collapsed row cannot: not "is there a
 * search here" — the word "Search" said that — but "a search of what". A rail
 * search box is assumed to search the page it is next to, and this one does
 * not; it reaches into the catalogue, into your conversations and into the
 * settings, and none of that is guessable from a magnifying glass. So it is
 * written down, once, in the half-second before the first keystroke.
 *
 * The orb above it is decoration and is not pretending otherwise. It is not a
 * spinner: nothing is loading, there is no request behind it, and it turns at
 * the same rate whether the app is busy or idle. It is here because a panel
 * that opens onto two lines of grey text is a panel that opens onto nothing,
 * and because fifty hard-edged pixels shaded in eight bands is the one piece
 * of motion in this app that looks like it came off a machine rather than out
 * of a design tool. See `.pixel-orb` in `globals.css` for how it is built.
 */
export function Resting() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-8">
      {/* The accent, which is a preference — so the one ornament in the search
          is painted in whatever colour the person picked for the app. */}
      <div aria-hidden className="pixel-orb text-primary">
        <div className="pixel-orb-shell">
          {ORB_DOTS.map((dot) => (
            <span
              key={`${dot.lat}:${dot.lon}`}
              className="pixel-orb-dot"
              // Four numbers, all derived from where the dot is: two place it
              // on the sphere, one times its brightness against the shell's
              // rotation, and one is that brightness at a standstill. Deriving
              // them from one longitude is what keeps the lit face contiguous.
              style={
                {
                  "--lat": dot.lat,
                  "--lon": dot.lon,
                  "--phase": dot.phase,
                  "--rest": dot.rest,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <p className="mt-5 text-[0.9375rem] font-medium text-foreground">
        Search anything
      </p>
      <p className="mt-1 text-center text-[0.8125rem] leading-relaxed text-muted-foreground">
        Activities, messages, pages, settings, and your account.
      </p>
    </div>
  );
}
