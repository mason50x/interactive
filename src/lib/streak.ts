/**
 * The words around the number.
 *
 * The streak itself is `convex/streaks.ts`; nothing here reaches the server or
 * decides anything durable.
 */

/**
 * "14 days", "1 day" — the count and its unit, and nothing after it.
 *
 * The chip this fills is a flame beside a number: the flame already says what
 * is being counted, so "streak" on the end was the word saying it twice. Here
 * `day` is counting rather than qualifying, so it takes the plural.
 */
export function streakLabel(current: number): string {
  return `${current} ${current === 1 ? "day" : "days"}`;
}
