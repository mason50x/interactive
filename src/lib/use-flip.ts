import { useLayoutEffect, useRef } from "react";
import { useStillness } from "@/lib/motion";

/**
 * The grid, moving to its new arrangement instead of appearing in it.
 *
 * Filtering and sorting are the same event as far as the browser is concerned:
 * the list React renders is a different list, the boxes are laid out again,
 * and every card is simply *elsewhere* on the next paint. What the eye gets
 * from that is a flicker with no information in it — nothing says which cards
 * survived the filter, nothing says the order changed rather than the
 * contents. This hook spends about half a second saying it.
 *
 * It is the FLIP trick and nothing cleverer. Positions are recorded at the end
 * of every pass; on the next one the new positions are measured, and each card
 * that moved is offset back to where it just was by a transform and animated
 * to nothing. The browser has already done the layout — the animation is a lie
 * told on top of it, in the two properties the compositor can run without
 * touching layout or paint. Which is the whole reason not to reach for
 * animated `top` or `height` here: 318 cards is not a page you can afford to
 * lay out sixty times a second.
 *
 * Three things happen, staggered into a sequence rather than fired at once,
 * because they are three different pieces of news and they are easier to read
 * one after another:
 *
 *   - Cards that no longer match **fade and shrink away** first, over about a
 *     sixth of a second, clearing the space before anything moves into it.
 *     React has already detached them by the time an effect runs, so a
 *     `MutationObserver` picks the nodes back up — its records carry the
 *     removed elements, and they are delivered on the microtask after the
 *     commit, which is still before the frame is painted. The node is
 *     re-parented into a layer above the grid at the coordinates it was last
 *     measured at and faded from there. Cloning was the other way to do this,
 *     and it meant keeping a detached copy of every on-screen card up to date
 *     against a list that scrolls; taking the real node costs nothing and is
 *     never stale.
 *   - Cards that survive **glide** from their old cell to their new one, a
 *     beat later, so the gap they are closing is already empty.
 *   - Cards that arrive **rise and grow in**, last, and one after another
 *     across the grid rather than all together — a short step per card, in
 *     reading order, which is what turns an appearance into a filling-in. They
 *     get no travel of their own because they have no old cell to come from,
 *     and inventing one is motion for its own sake.
 *
 * Nothing further than a screen off the fold animates. The catalogue is not
 * virtualised — all 318 cards are in the tree — and animating the 280 nobody
 * is looking at would hand the compositor 280 layers to hold for half a second
 * on every keystroke, to no one's benefit: they are not on screen, so their
 * motion is not seen, and they are in their new places by the time anyone
 * scrolls to them. That is the one limit here that is about cost, and it is
 * spent where it cannot be seen rather than on the part that can. Measuring
 * all of them is cheap — one forced layout and a rect each — so the cull sits
 * between the measuring and the moving.
 *
 * The same reasoning caps a glide at one viewport: a card that was ranked
 * 200th and is now 3rd would otherwise fly in from a kilometre below the fold,
 * which reads as a glitch rather than as an origin, so it is treated as an
 * arrival instead.
 *
 * Coordinates are measured against the grid's own box rather than the
 * viewport, because the scroll container here is the dashboard shell and not
 * the window (see the dashboard layout), and because the count line above the
 * grid comes and goes with the filter. Grid-relative coordinates make both
 * invisible: scrolling between two keystrokes cannot corrupt a cached
 * position, and the whole grid shifting down by a line is not read as every
 * card having moved.
 *
 * Interruptions — which is to say, typing — are the normal case rather than
 * the edge one, and they are handled twice over. A card caught mid-flight is
 * measured with its in-flight transform undone, so the position cached is the
 * layout one and the position the next glide starts from is where the card
 * visibly *is*; it is picked up at the scale and the opacity it is drawn at
 * too, so nothing snaps to full on the first frame of the takeover. Cards
 * redirect in mid-air rather than starting over. And the sequence itself gives
 * way under a fast hand: a pass that lands on top of the last one drops the
 * delays and the stagger and halves the durations, because a choreography
 * nobody has time to watch is just a flicker. See `CALM` and `HURRIED`.
 *
 * Reduced motion turns all of it off at the source. The blanket rule at the
 * foot of `globals.css` cannot reach a Web Animations call, so this asks
 * `useStillness` and keeps only the bookkeeping.
 */

/**
 * Two tempos for the same three acts, in milliseconds.
 *
 * `CALM` is the choreography: departures clear the space, survivors move into
 * it a beat later, arrivals fill in last and one after another. It reads as a
 * single half-second gesture and it is what a category, a sort, or a query you
 * have finished typing gets.
 *
 * `HURRIED` is the same three acts with the ceremony taken out, and it exists
 * because the ceremony is actively wrong at speed. Every keystroke is another
 * arrangement, so a card can be told three times in half a second to wait
 * 150ms and then rise — which is a card that is never actually on screen, and
 * a grid that looks like it is flickering rather than filtering. Under a fast
 * hand the delays and the stagger collapse and the durations halve, so each
 * keystroke resolves before the next one lands.
 */
const CALM = {
  leave: { delay: 0, duration: 190 },
  move: { delay: 60, duration: 380 },
  arrive: { delay: 150, duration: 340 },
  step: 18,
  limit: 200,
};

const HURRIED = {
  leave: { delay: 0, duration: 110 },
  move: { delay: 0, duration: 200 },
  arrive: { delay: 0, duration: 160 },
  step: 0,
  limit: 0,
};

/** How many departures the layer will hold at once. */
const CROWD = 24;

/** A pass this soon after the last one is part of the same thought, and gets
 *  the hurried tempo. Roughly a fast typist's gap between keystrokes plus the
 *  beat `useDeferredValue` adds. */
const HURRY = 320;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** How far outside the viewport still counts as worth animating: a screen of
 *  slack in each direction, which covers the rows that scroll into view while
 *  the grid is still settling. */
const REACH = 1;

type Spot = { x: number; y: number; width: number; height: number };

type Reading = {
  el: HTMLElement;
  id: string;
  /** Where the card's cell is, relative to the grid. */
  spot: Spot;
  /** How far the card is currently drawn from that cell, and how it is
   *  currently drawn — an animation this pass interrupts has to be picked up
   *  from the values on screen rather than from the ones it was aiming at. */
  tx: number;
  ty: number;
  scale: number;
  alpha: number;
  /** Where the cell is relative to the viewport, for the cull. */
  top: number;
};

/**
 * Returns the two refs the grid needs: `frame` on the element wrapping the
 * list — it is the coordinate origin, so it has to be positioned and has to
 * move with the cards — and `ghosts` on an empty, inert, absolutely positioned
 * layer inside it where departing cards are raised.
 *
 * Every animated child carries `data-flip="<stable id>"`.
 *
 * `signature` is whatever changes when the arrangement changes; the rendered
 * array itself is the obvious thing to pass. Re-renders that leave it alone —
 * a context resolving, a sibling's state — do not disturb the cache.
 */
export function useFlip(signature: unknown) {
  const frame = useRef<HTMLDivElement | null>(null);
  const ghosts = useRef<HTMLDivElement | null>(null);

  /** Where every card sat at the end of the last pass, in grid coordinates. */
  const spots = useRef(new Map<string, Spot>());
  /** The same map, held for the beat between a commit and the observer that
   *  reports what the commit removed. A departure is placed from this. */
  const vacated = useRef(new Map<string, Spot>());
  /** Everything in the air, so the next pass can read its progress and take
   *  it over. */
  const flights = useRef(new Map<HTMLElement, Animation>());
  /** The first pass has nothing to compare against and animates nothing. */
  const primed = useRef(false);
  /** When the last pass ran, and the tempo it chose — the observer reporting
   *  departures runs after the effect that picks one and has to match it. */
  const beat = useRef(0);
  const tempo = useRef(CALM);

  const still = useStillness();

  useLayoutEffect(() => {
    const root = frame.current;
    if (!root) return;

    const animate = primed.current && !still;
    primed.current = true;

    // Still typing, or a considered change? The answer is the gap since the
    // last pass and nothing else — it does not matter which control caused it.
    const struck = performance.now();
    tempo.current = struck - beat.current < HURRY ? HURRIED : CALM;
    beat.current = struck;
    const pace = tempo.current;

    const was = spots.current;
    const now = new Map<string, Spot>();
    const glides: {
      el: HTMLElement;
      dx: number;
      dy: number;
      scale: number;
      alpha: number;
    }[] = [];
    const arrivals: HTMLElement[] = [];

    const reach = window.innerHeight * REACH;
    const ceiling = -reach;
    const floor = window.innerHeight + reach;
    const leap = window.innerHeight;

    for (const {
      el,
      id,
      spot,
      tx,
      ty,
      scale,
      alpha,
      top,
    } of read(root, flights.current)) {
      now.set(id, spot);

      if (!animate) continue;
      if (top + spot.height <= ceiling || top >= floor) continue;

      const before = was.get(id);
      if (!before) {
        arrivals.push(el);
        continue;
      }

      const dx = before.x + tx - spot.x;
      const dy = before.y + ty - spot.y;

      // A move longer than the screen is not a move anyone can follow.
      if (Math.abs(dy) > leap) {
        arrivals.push(el);
      } else if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        glides.push({ el, dx, dy, scale, alpha });
      }
    }

    spots.current = now;
    // The observer runs after this effect and needs the map this pass just
    // replaced: a card that left has no new position, only an old one.
    vacated.current = was;

    for (const { el, dx, dy, scale, alpha } of glides) {
      // The card is picked up exactly as it is drawn, not as a bare
      // translation: a card interrupted halfway through arriving is still part
      // of the way through a scale and a fade, and starting the glide at
      // `scale(1)`/`opacity: 1` would snap both to full on the first frame.
      take(
        flights.current,
        el,
        [
          {
            opacity: alpha,
            transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
          },
          { opacity: 1, transform: "translate(0px, 0px) scale(1)" },
        ],
        {
          ...pace.move,
          easing: EASE,
          // The delay is a pause at the *old* position while departures clear,
          // which is only what it looks like if the first frame is held. With
          // the default fill the card would sit in its new cell for the length
          // of the delay and then jump back to start — which is the pop, on
          // every card, on every pass.
          fill: "backwards",
        },
      );
    }

    arrivals.forEach((el, index) => {
      take(
        flights.current,
        el,
        [
          { opacity: 0, transform: "translate(0px, 14px) scale(0.94)" },
          { opacity: 1, transform: "translate(0px, 0px) scale(1)" },
        ],
        {
          duration: pace.arrive.duration,
          delay: pace.arrive.delay + Math.min(index * pace.step, pace.limit),
          easing: EASE,
          // Same reason as the glide: without it a staggered card sits in full
          // view for its share of the stagger and then blinks out to start.
          fill: "backwards",
        },
      );
    });

    for (const [el, flight] of flights.current) {
      if (!el.isConnected) {
        flight.cancel();
        flights.current.delete(el);
      }
    }
  }, [signature, still]);

  useLayoutEffect(() => {
    const root = frame.current;
    if (!root || still) return;

    const observer = new MutationObserver((records) => {
      const layer = ghosts.current;
      if (!layer) return;

      // Measured now rather than reused from the effect above, because how far
      // down the page a departure belongs is a question about where the grid
      // is on *this* frame.
      const origin = root.getBoundingClientRect();
      const floor = window.innerHeight;

      const leaving: { node: HTMLElement; id: string; spot: Spot }[] = [];

      for (const record of records) {
        for (const node of record.removedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const id = node.dataset.flip;
          // Reordering the list is a removal and an insertion of the same
          // node, so anything still in the document was moved, not dropped —
          // and the effect above is already gliding it. A node with no id is
          // one of this layer's own ghosts being cleared away at the end of
          // its fade, which is not an event.
          if (!id || node.isConnected) continue;

          const spot = vacated.current.get(id);
          if (!spot) continue;

          const top = origin.top + spot.y;
          if (top + spot.height <= 0 || top >= floor) continue;

          leaving.push({ node, id, spot });
        }
      }

      if (leaving.length === 0) return;

      for (const { node, id, spot } of leaving) {
        // It may have been on its way somewhere when it was cut; the spot is a
        // layout position, so the transform taking it away from one has to go.
        flights.current.get(node)?.cancel();
        flights.current.delete(node);

        // Without this the node would be read as its own departure when the
        // fade ends and it is taken out of the layer. The id moves to a name
        // this layer keeps to itself.
        delete node.dataset.flip;
        node.dataset.flipGone = id;

        // A card can leave, come back on the next keystroke and leave again
        // before its first exit has finished, and two copies of one card
        // fading over each other is a smear. The older one is already the
        // fainter, so it is the one that goes.
        layer.querySelector(`[data-flip-gone="${CSS.escape(id)}"]`)?.remove();

        // Out of flow, so the grid below reflows as though it were already
        // gone — which it is. The size has to be written on because the cell
        // that was giving it one no longer exists.
        node.style.position = "absolute";
        node.style.left = `${spot.x}px`;
        node.style.top = `${spot.y}px`;
        node.style.width = `${spot.width}px`;
        node.style.height = `${spot.height}px`;
        node.style.margin = "0";
        // An `<li>` outside a list draws its own marker.
        node.style.display = "block";
        node.style.listStyle = "none";
        layer.append(node);

        const fade = node.animate(
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(0.96)" },
          ],
          { ...tempo.current.leave, easing: "ease-out", fill: "forwards" },
        );
        fade.finished.then(
          () => node.remove(),
          () => {},
        );
      }

      // A hand fast enough to outrun the fades would otherwise leave a drift
      // of them stacked over the grid. Anything past a screenful is older than
      // the ones in front of it, and so already the most transparent.
      while (layer.children.length > CROWD) layer.firstElementChild?.remove();
    });

    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
    // Rebuilt rather than told, on the one occasion the answer changes: a
    // reader who has asked for stillness mid-session gets no observer at all.
  }, [still]);

  // The cells move under a resize, and a position cached from before one would
  // send every card flying out of a column that no longer exists. Re-measuring
  // is the same read as the effect above with nothing animated.
  useLayoutEffect(() => {
    const root = frame.current;
    if (!root) return;

    const observer = new ResizeObserver(() => {
      const fresh = new Map<string, Spot>();
      for (const { id, spot } of read(root, flights.current)) fresh.set(id, spot);
      spots.current = fresh;
    });

    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return { frame, ghosts };
}

/**
 * Every card's cell, relative to the grid, with any in-flight transform taken
 * back out of it.
 *
 * All reads and no writes, so the browser resolves layout once for the whole
 * of it. The transform is only asked for when the card is known to be moving,
 * partly to save 318 style resolutions and partly because a finished animation
 * is dropped from the flight list a microtask after it ends: for that beat an
 * element can be listed as moving and already back at `none`, which
 * `DOMMatrix` would throw on rather than read as zero.
 *
 * Undoing the transform is not just a subtraction, because arrivals scale as
 * well as translate and a scaled box reports a smaller rect around the same
 * centre. Working back through the centre gets the real cell out of either.
 */
function read(
  root: HTMLElement,
  flights: Map<HTMLElement, Animation>,
): Reading[] {
  const origin = root.getBoundingClientRect();
  const readings: Reading[] = [];

  for (const el of root.querySelectorAll<HTMLElement>("[data-flip]")) {
    const id = el.dataset.flip;
    if (!id) continue;

    const box = el.getBoundingClientRect();
    const style = flights.has(el) ? getComputedStyle(el) : null;
    const drawn = style ? style.transform : "none";

    let tx = 0;
    let ty = 0;
    let scale = 1;
    let width = box.width;
    let height = box.height;
    let left = box.left;
    let top = box.top;

    if (drawn && drawn !== "none") {
      const matrix = new DOMMatrixReadOnly(drawn);
      scale = matrix.a || 1;
      tx = matrix.m41;
      ty = matrix.m42;
      width = box.width / scale;
      height = box.height / scale;
      left = box.left + box.width / 2 - tx - width / 2;
      top = box.top + box.height / 2 - ty - height / 2;
    }

    readings.push({
      el,
      id,
      spot: { x: left - origin.left, y: top - origin.top, width, height },
      tx,
      ty,
      scale,
      alpha: style ? Number(style.opacity) || 0 : 1,
      top,
    });
  }

  return readings;
}

/** Start an animation on a card, replacing whatever it was already doing. Two
 *  animations on `transform` compose by start order otherwise, and the loser
 *  would still be holding a value when the winner ended. */
function take(
  flights: Map<HTMLElement, Animation>,
  el: HTMLElement,
  frames: Keyframe[],
  timing: KeyframeAnimationOptions,
) {
  flights.get(el)?.cancel();
  const flight = el.animate(frames, timing);
  flights.set(el, flight);
  flight.finished.then(
    () => {
      if (flights.get(el) === flight) flights.delete(el);
    },
    () => {},
  );
}
