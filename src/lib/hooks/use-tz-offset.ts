import { useState } from "react";

/**
 * The browser's UTC offset in minutes, read once and kept for the life of the
 * component.
 *
 * Every Convex function that keys on a day takes this, which makes it a query
 * *argument* — and a fresh value on every render would mean tearing down and
 * re-opening a subscription on every render. Holding it in state is what makes
 * it stable.
 *
 * A tab left open across a timezone change (a flight, or a DST boundary) keeps
 * the offset it started with. That is the right trade: the alternative is
 * watching the clock in order to resubscribe everything at 2am, in exchange
 * for a day boundary that was going to be re-read on the next navigation
 * anyway.
 *
 * On the server this reads the server's offset, which is UTC. Nothing renders
 * it — it only ever travels into a Convex query, and those return `undefined`
 * until the client connects — so there is nothing here for hydration to
 * disagree about.
 */
export function useTzOffset(): number {
  const [offset] = useState(() => new Date().getTimezoneOffset());
  return offset;
}
