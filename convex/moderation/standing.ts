import { LADDER, RATES, STRIKE_TTL_MS, TRUST, type Tier } from "./limits";

/**
 * How much trouble somebody is in, and what happens because of it.
 *
 * The whole of enforcement is one number. Every refusal writes a strike with a
 * weight and an expiry; standing is the weights that have not expired, added
 * up; and the ladder turns that into a mute or a ban. Nothing else is
 * consulted, which is what makes a system with no humans in it explainable —
 * there is exactly one quantity, the person it applies to can see every row
 * that contributes to it, and every row leaves on a date they can be told.
 *
 * ## Why it decays
 *
 * Strikes expire after thirty days. On a site whose users are mostly fourteen
 * that is not leniency, it is the design: somebody who spent one afternoon
 * being awful and then stopped is indistinguishable, a month later, from
 * somebody who never did it, and a permanent record would keep punishing the
 * first one for a version of themselves that no longer exists. It also means
 * nobody has to be available to lift anything, which is just as well.
 *
 * The exception is the ban, which does not decay and is not on this ladder for
 * most of the accounts that get one — `banOnSight` rules skip straight to it.
 * That is the one irreversible thing this system does, and the reason the list
 * of rules that can reach it is short and explicit rather than emergent.
 */

/** A strike, as the ledger stores it. */
export type StrikeRow = { weight: number; expiresAt: number };

/** The consequence a standing carries, or `null` when it carries none. */
export type Consequence = { durationMs: number | null };

/** Sum of everything that has not yet expired. */
export function activeStanding(strikes: StrikeRow[], now: number): number {
  let total = 0;
  for (const strike of strikes) {
    if (strike.expiresAt > now) total += strike.weight;
  }
  return total;
}

/** When a strike written now stops counting. */
export function expiryFor(now: number): number {
  return now + STRIKE_TTL_MS;
}

/**
 * The heaviest rung the standing has reached, or nothing.
 *
 * `LADDER` is ordered heaviest first, so the first match is the answer. A
 * `durationMs` of `null` is the ban.
 */
export function consequenceFor(standing: number): Consequence | null {
  for (const rung of LADDER) {
    if (standing >= rung.at) return { durationMs: rung.durationMs };
  }
  return null;
}

/**
 * What a mute currently reads as, given a standing and the ledger.
 *
 * Called after a strike lands. Returns the moment the mute lifts, `null` for a
 * ban, or `undefined` when the standing does not reach the ladder at all.
 */
export function muteUntil(standing: number, now: number): number | null | undefined {
  const consequence = consequenceFor(standing);
  if (consequence === null) return undefined;
  if (consequence.durationMs === null) return null;
  return now + consequence.durationMs;
}

/**
 * How much rope an account gets.
 *
 * Age and volume together, because either one alone is trivially satisfied: an
 * account can be a week old having said nothing, and can say two hundred things
 * in an afternoon. `trusted` additionally requires a clean ledger, so a strike
 * costs the sender their rate allowance as well as their standing — which is
 * the cheapest possible response to somebody who has just demonstrated what
 * they intend to do with it.
 */
export function tierFor(
  createdAt: number,
  messagesSent: number,
  standing: number,
  now: number,
): Tier {
  const age = now - createdAt;
  if (age < TRUST.freshUntilMs || messagesSent < TRUST.freshUntilMessages) {
    return "fresh";
  }
  if (
    standing === 0 &&
    age >= TRUST.trustedAfterMs &&
    messagesSent >= TRUST.trustedAfterMessages
  ) {
    return "trusted";
  }
  return "regular";
}

/** Whether the sends in the ring break either window for this tier. */
export function overRate(
  sends: { at: number }[],
  tier: Tier,
  now: number,
): boolean {
  for (const window of RATES[tier]) {
    let count = 0;
    for (const send of sends) {
      if (now - send.at < window.ms) count += 1;
    }
    if (count >= window.count) return true;
  }
  return false;
}
