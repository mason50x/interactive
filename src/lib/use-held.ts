import { useState } from "react";

/**
 * The last defined value this was given, while the current one is loading.
 *
 * For a subscription that is dropped and picked up again — a panel that
 * closes and reopens, a query whose arguments change — and would otherwise
 * draw an empty frame for the length of a round trip before filling in with
 * the numbers it showed a moment ago. The held copy is what is on screen
 * while the fresh one arrives, and the fresh one replaces it the moment it
 * does.
 *
 * Adjusted while rendering rather than in an effect: this is state that is a
 * value plus a memory of it, and an effect would paint one frame of the gap
 * first, which is the frame this exists to prevent. Convex hands back the
 * same object for an unchanged result, so the comparison settles on the first
 * render rather than chasing itself.
 */
export function useHeld<T>(value: T | undefined): T | undefined {
  const [held, setHeld] = useState<T | undefined>(undefined);
  if (value !== undefined && value !== held) setHeld(value);
  return value ?? held;
}
