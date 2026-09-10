import type { WeatherKind } from "@/lib/weather";

/**
 * The eight weather marks, drawn here because Heroicons has three of them.
 *
 * Its set covers sun, moon, cloud and bolt and stops — there is no rain, no
 * snow, no fog and no cloud-with-a-sun-behind-it, which between them are most
 * of what a forecast ever says. Mixing a Heroicon for "clear" with a
 * hand-drawn mark for "rain" would put two different pens on the same card, so
 * all eight are drawn together against one set of rules: a 24-unit box, a
 * filled cloud, and 1.9-unit round strokes for everything falling out of it.
 *
 * ## Two colours, one of them borrowed
 *
 * The cloud is `currentColor` and the warm parts — sun, moon, lightning — take
 * `--glyph-warm`, falling back to `currentColor` when nobody sets it. That is
 * what lets one component be a full-colour mark on the weather card and a
 * plain monochrome one anywhere else, without a variant prop deciding which.
 *
 * The precipitation is deliberately *not* warm: rain in the sun's colour reads
 * as sparks. It is `currentColor` at a lower opacity, so it sits behind the
 * cloud in the same hue rather than competing with it.
 */

/** Heroicons' own cloud, which is the one shape in the set worth borrowing —
 *  it is the base of five of these and redrawing it would only be a slightly
 *  different cloud sitting next to their `CloudIcon` elsewhere in the app. */
const CLOUD =
  "M4.5 9.75a6 6 0 0 1 11.573-2.226 3.75 3.75 0 0 1 4.133 4.303A4.5 4.5 0 0 1 18 20.25H6.75a5.25 5.25 0 0 1-2.23-10.004 6.072 6.072 0 0 1-.02-.496Z";

/** Heroicons' bolt, scaled into the gap under a lifted cloud. */
const BOLT =
  "M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z";

/**
 * The cloud, moved up and shrunk to leave the bottom third of the box for
 * whatever is falling out of it. Every wet kind shares this transform, so the
 * clouds all sit at the same height and the row of glyphs does not bob.
 */
const RAINING_CLOUD = "translate(0.9 -1.6) scale(0.86)";

const WARM = "var(--glyph-warm, currentColor)";

/**
 * Rays around a sun, as coordinates rather than as eight hand-typed pairs.
 *
 * `start` and `end` are radii: the ray is the segment of that bearing between
 * them. Written this way because the two numbers are the design — how far the
 * rays sit off the disc and how long they are — and a list of sixteen decimals
 * is the same design with the intent removed.
 */
function rays(
  cx: number,
  cy: number,
  count: number,
  start: number,
  end: number,
  from = 0,
) {
  return Array.from({ length: count }, (_, index) => {
    const angle = from + (index * 2 * Math.PI) / count;
    const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    return {
      x1: cx + dx * start,
      y1: cy + dy * start,
      x2: cx + dx * end,
      y2: cy + dy * end,
    };
  });
}

const FULL_SUN = rays(12, 12, 8, 6.9, 9.6, -Math.PI / 2);
/** Only the bearings that clear the cloud in front of it. */
const PEEKING_SUN = rays(15.8, 7.4, 8, 4.8, 6.6, -Math.PI / 2).slice(0, 4);

function Strokes({ d, opacity = 0.75 }: { d: string; opacity?: number }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeOpacity={opacity}
      strokeWidth={1.9}
      strokeLinecap="round"
    />
  );
}

function Cloud({ transform }: { transform?: string }) {
  return <path d={CLOUD} transform={transform} />;
}

function Sun() {
  return (
    <g fill={WARM} stroke={WARM}>
      <circle cx={12} cy={12} r={4.7} />
      {FULL_SUN.map((ray, index) => (
        <line key={index} {...ray} strokeWidth={2} strokeLinecap="round" />
      ))}
    </g>
  );
}

/** The crescent, cut rather than drawn: a filled disc with a second disc
 *  punched out of it by the even-odd rule, which is the one way to get a
 *  crescent whose horns come to a real point. */
function Moon() {
  return (
    <path
      fill={WARM}
      fillRule="evenodd"
      d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8 8.8 8.8 0 0 0-3.1-6.7 6.9 6.9 0 0 1-9.4 9.6A8.8 8.8 0 0 1 12 3.2Zm-2.4 2.3a6.5 6.5 0 1 0 7.9 9.4 9.1 9.1 0 0 1-7.9-9.4Z"
    />
  );
}

function Marks({ kind }: { kind: WeatherKind }) {
  switch (kind) {
    case "rain":
      return (
        <Strokes d="M9.4 17.1 7.7 21.6M13.2 17.1 11.5 21.6M17 17.1 15.3 21.6" />
      );
    case "drizzle":
      return (
        <Strokes
          d="M9.2 17.3 8.4 19.7M13 17.3 12.2 19.7M16.8 17.3 16 19.7"
          opacity={0.6}
        />
      );
    case "snow":
      return (
        <g fill="currentColor" fillOpacity={0.75}>
          <circle cx={8.6} cy={18.6} r={1.15} />
          <circle cx={12.6} cy={21} r={1.15} />
          <circle cx={16.6} cy={18.6} r={1.15} />
        </g>
      );
    case "storm":
      return (
        <g transform="translate(7.6 14.2) scale(0.42)">
          <path d={BOLT} fill={WARM} />
        </g>
      );
    case "fog":
      // Ragged on purpose — three lines of the same length read as a barcode,
      // and fog is the one condition with no edge to it.
      return <Strokes d="M5.6 18.4h11.2M7.4 21.4h9.4" opacity={0.55} />;
    default:
      return null;
  }
}

export function WeatherGlyph({
  kind,
  isDay = true,
  className,
}: {
  kind: WeatherKind;
  isDay?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      {kind === "clear" && (isDay ? <Sun /> : <Moon />)}

      {kind === "partly" && (
        <>
          {isDay ? (
            <g fill={WARM} stroke={WARM}>
              <circle cx={15.8} cy={7.4} r={3.5} />
              {PEEKING_SUN.map((ray, index) => (
                <line
                  key={index}
                  {...ray}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              ))}
            </g>
          ) : (
            <g transform="translate(8.2 -2.4) scale(0.62)">
              <Moon />
            </g>
          )}
          {/* In front of the sun and pulled down-left, which is the whole
              difference between "partly cloudy" and two marks in a box. */}
          <g transform="translate(-1.4 3.1) scale(0.82)">
            <Cloud />
          </g>
        </>
      )}

      {kind === "cloudy" && <Cloud />}

      {kind !== "clear" && kind !== "partly" && kind !== "cloudy" && (
        <>
          <Cloud transform={RAINING_CLOUD} />
          <Marks kind={kind} />
        </>
      )}
    </svg>
  );
}
