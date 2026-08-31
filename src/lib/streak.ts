/**
 * The words around the number.
 *
 * The streak itself is `convex/streaks.ts`; nothing here reaches the server or
 * decides anything durable. It exists so the celebration and the chip agree on
 * how a run is described, and so that adding a milestone is one edit.
 */

/**
 * The runs worth stopping for, and what to say when one lands.
 *
 * Ordered longest first, because the lookup takes the first match and a run of
 * 365 is also a run of 100. A milestone is not required to be a round number —
 * it is required to be a day someone would tell another person about.
 */
const milestones: { at: number; name: string; line: string }[] = [
  { at: 365, name: "a year", line: "A year of it. Every single day." },
  { at: 200, name: "two hundred days", line: "Two hundred days." },
  { at: 100, name: "a hundred days", line: "Three figures." },
  { at: 50, name: "fifty days", line: "Fifty days deep." },
  { at: 30, name: "a month", line: "A whole month, unbroken." },
  { at: 14, name: "two weeks", line: "Two weeks running." },
  { at: 7, name: "a full week", line: "A full week." },
  { at: 3, name: "three days", line: "Three in a row. It's a habit now." },
  { at: 2, name: "two days", line: "Back again." },
  { at: 1, name: "day one", line: "The fire is lit." },
];

/**
 * The next run worth stopping for, and how far into it you are.
 *
 * `from` is the milestone just cleared rather than zero, which is what makes
 * the bar mean something on day 31: measured from zero, the month behind you
 * would fill 8% of the way to a hundred days and read as no progress at all.
 * Measured from thirty it reads as one day into the next stretch, which is
 * what actually happened.
 *
 * `null` once the longest milestone is behind you. There is nothing left to
 * be counting towards, and inventing a target past a year would be the card
 * moving the goalposts on someone who has already won.
 */
export function nextMilestone(
  current: number,
): { at: number; name: string; from: number } | null {
  // Ordered longest first, so the last entry above `current` is the nearest
  // one ahead of it.
  const ahead = milestones.filter(({ at }) => at > current);
  const next = ahead[ahead.length - 1];
  if (!next) return null;

  const cleared = milestones.find(({ at }) => at <= current);
  return { at: next.at, name: next.name, from: cleared?.at ?? 0 };
}

/**
 * The line under the number.
 *
 * A personal best outranks a milestone, because it is the rarer thing to have
 * happened and only one line fits. Beating your own record on day one is not a
 * record, though — everybody's first day is their best day — so that case
 * falls through to the milestone table.
 */
export function streakMessage(current: number, best: number): string {
  if (current > 1 && current >= best) return "A new personal best.";

  const milestone = milestones.find(({ at }) => current === at);
  if (milestone) return milestone.line;

  if (current % 7 === 0) return `${current / 7} weeks running.`;
  return "Keep it going.";
}

/**
 * "14 days", "1 day" — the count and its unit, and nothing after it.
 *
 * The chip this fills is a flame beside a number: the flame already says what
 * is being counted, so "streak" on the end was the word saying it twice. Here
 * `day` is counting rather than qualifying, so it takes the plural — unlike
 * the celebration's "day streak", where the same word is an adjective and
 * stays singular however many days it stands for.
 */
export function streakLabel(current: number): string {
  return `${current} ${current === 1 ? "day" : "days"}`;
}
