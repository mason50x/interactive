"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * A small set of answers to one question, with the lit face travelling between
 * them.
 *
 * For a choice of three or four where each answer is worth a sentence — who may
 * reach you, how people get into a group. Radio buttons would do the job and
 * did, and the reason they do not any more is that the dot is a control drawn
 * next to the thing it controls, while this is the thing itself lighting up.
 *
 * The chosen tile draws no face of its own. `.nav-pill` — the lit face the rail
 * puts under the page you are on — is a single element behind all of them that
 * travels to whichever is on, so each tile reports its box upward and otherwise
 * only switches its ink.
 *
 * That ink is switched and never faded: zero duration behind a delay, so each
 * word holds the colour it had and then changes in one frame, under the pill,
 * while the pill is over it. Anything that interpolates spends those 300ms
 * part-way between a dark label and a white one, over a face that is itself
 * only half arrived. The weight rides the same beat and for the same reason —
 * white on colour needs the extra stroke to hold its edges, and thickening a
 * word changes its width, so the letters have to shuffle out of sight.
 *
 * The delay differs by direction, and the leaving one is a handover rather than
 * a switch. The boxes are four pixels apart, so a pill interpolating between
 * two of them laps onto the one it is travelling to within about ten
 * milliseconds and stays over the one it is leaving until roughly 96% of the
 * way — which, on this curve, is around 180ms of the 300. Arriving is therefore
 * easy: go white at 40ms, long since covered.
 *
 * Leaving is the one that bit twice. A hard switch has to land exactly on that
 * crossing, and either side of it is a different ugliness: early is a black
 * word on a blue face, late is a white word on a white background, which is a
 * label that vanishes. So it is not hard — it fades over 75ms straddling the
 * crossing, passing through a grey that is legible on either. The eye reads a
 * handoff instead of a flash, and the timing no longer has to be exact.
 */
export type Tile<T extends string> = {
  value: T;
  label: string;
  /** The gloss under the label. Optional — a one-word answer needs none. */
  detail?: string;
  icon?: Icon;
  /** This tile's own box: a column span, usually. */
  className?: string;
};

/** How long the pill takes, stated once. See `moving` below. */
const TRAVEL_MS = 300;

export function OptionTiles<T extends string>({
  value,
  options,
  onPick,
  className,
}: {
  /** `undefined` while the answer is still loading: the pill is not drawn. */
  value: T | undefined;
  options: Tile<T>[];
  onPick: (value: T) => void;
  /** The arrangement, which is the caller's — a grid, usually. */
  className?: string;
}) {
  // Where the lit face is, in the group's own coordinates. One element that
  // moves rather than three that light up: travelling from a narrow cell to a
  // wide row is a diagonal *and* a widening at once, which is the whole reason
  // it is worth animating — the pill is seen becoming the bigger thing rather
  // than going out here and coming on there.
  const groupRef = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<T, HTMLButtonElement>());
  const [pill, setPill] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const register = useCallback((option: T, node: HTMLButtonElement | null) => {
    if (node) tiles.current.set(option, node);
    else tiles.current.delete(option);
  }, []);

  // `offsetLeft`/`offsetTop` rather than `getBoundingClientRect`: the wrapper
  // is the offset parent, so those are already in the coordinates the pill is
  // placed in and need no correcting for the scroller around them. Before
  // paint, so the first placement is never a frame spent at the origin.
  const place = useCallback(() => {
    const node = value === undefined ? undefined : tiles.current.get(value);
    setPill(
      node === undefined
        ? null
        : {
            x: node.offsetLeft,
            y: node.offsetTop,
            width: node.offsetWidth,
            height: node.offsetHeight,
          },
    );
  }, [value]);

  useLayoutEffect(place, [place]);

  // Borders stand down for as long as the pill is travelling.
  //
  // They were the thing that looked wrong: a tile paints above the pill, so the
  // one being left got its hairline back while the pill was still sitting on
  // it, and — going from a narrow cell to a wide row — the pill's box sweeps
  // across a tile it is not going to, which then drew a grey rectangle over the
  // middle of a blue face. Rather than time each of them against a shape that
  // passes over them differently, all of them give way at once and come back
  // when it has stopped.
  //
  // A timer rather than `transitionend`, because three properties are animating
  // and that event fires once per property; the timer is the one fact — how
  // long the journey takes — stated once.
  const [moving, setMoving] = useState(false);
  const was = useRef(value);

  useEffect(() => {
    const previous = was.current;
    was.current = value;
    // `undefined` is the answer not having landed yet, not a choice being
    // changed — the pill is placed for the first time, it does not travel.
    if (previous === undefined || previous === value) return;

    setMoving(true);
    const timer = setTimeout(() => setMoving(false), TRAVEL_MS + 20);
    return () => clearTimeout(timer);
  }, [value]);

  // The column this sits in is 288px at `md` and 320px at `lg`, and a sheet is
  // narrower again — the pill is placed in pixels, so without this it keeps the
  // width it was measured at across the break and sits short of its tile.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const observer = new ResizeObserver(place);
    observer.observe(group);
    return () => observer.disconnect();
  }, [place]);

  return (
    <div ref={groupRef} className={cn("relative", className)}>
      {/* Under them and never over them — it is the face they are written on.
          First in the DOM so that the tiles, which are positioned too, paint
          above it. */}
      {pill === null ? null : (
        <span
          aria-hidden
          className="nav-pill pointer-events-none absolute top-0 left-0 rounded-lg border transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            width: pill.width,
            height: pill.height,
            transform: `translate(${pill.x}px, ${pill.y}px)`,
          }}
        />
      )}

      {options.map((option) => (
        <OneTile
          key={option.value}
          tile={option}
          on={value === option.value}
          moving={moving}
          onPick={onPick}
          register={register}
        />
      ))}
    </div>
  );
}

function OneTile<T extends string>({
  tile,
  on,
  moving,
  onPick,
  register,
}: {
  tile: Tile<T>;
  on: boolean;
  /** The pill is in flight, so this one shows no border whatever it is. */
  moving: boolean;
  onPick: (value: T) => void;
  register: (value: T, node: HTMLButtonElement | null) => void;
}) {
  const Glyph = tile.icon;

  // Onto the face early and in one frame, off it across the crossing. See the
  // note at the top of this file.
  const ink = on ? "delay-[40ms] duration-0" : "delay-[150ms] duration-75";

  return (
    <button
      ref={(node) => register(tile.value, node)}
      type="button"
      onClick={() => onPick(tile.value)}
      aria-pressed={on}
      className={cn(
        // `relative` so it paints above the pill. The border is on the base
        // rather than only on one state, so the contents sit at the same inset
        // either way and nothing shifts by a pixel when you pick one — the lit
        // one hands its border over to the pill, which draws a seated one of
        // its own on exactly the same box.
        "relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border px-2.5 py-3 text-center transition-[background-color,border-color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
        on || moving ? "border-transparent" : "border-border",
        on ? null : "hover:bg-foreground/[0.04]",
        tile.className,
      )}
    >
      {Glyph === undefined ? null : (
        <Glyph
          className={cn(
            "size-5 shrink-0 transition-[color]",
            ink,
            on ? "text-primary-foreground" : "text-muted-foreground",
          )}
        />
      )}

      <span className="min-w-0">
        <span
          className={cn(
            "block truncate text-[0.875rem] transition-[color,font-weight]",
            ink,
            on ? "font-semibold text-primary-foreground" : "font-medium",
          )}
        >
          {tile.label}
        </span>
        {tile.detail === undefined ? null : (
          <span
            className={cn(
              "mt-0.5 block text-[0.8125rem] leading-snug transition-[color]",
              ink,
              on ? "text-primary-foreground/85" : "text-muted-foreground",
            )}
          >
            {tile.detail}
          </span>
        )}
      </span>
    </button>
  );
}
