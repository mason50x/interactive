import { RATES, TRUST, type Tier } from "./limits";

/**
 * How much sending room an account gets.
 *
 * Age and volume together, because either one alone is trivially satisfied: an
 * account can be a week old having said nothing, and can say two hundred things
 * in an afternoon. Screening decisions never change this tier.
 */
export function tierFor(
  createdAt: number,
  messagesSent: number,
  now: number,
): Tier {
  const age = now - createdAt;
  if (age < TRUST.freshUntilMs || messagesSent < TRUST.freshUntilMessages) {
    return "fresh";
  }
  if (
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
