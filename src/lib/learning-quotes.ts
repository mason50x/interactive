import quotes from "./learning-quotes.json";

export const LEARNING_QUOTES: readonly string[] = quotes;
export const QUOTE_DAY_MS = 86_400_000;

/** Shared UTC days, no account or browser state. 137 is coprime to 525,
 * so adjacent days mix subjects and the full library plays before repeating. */
export function dailyLearningQuote(now: number = Date.now()): string {
  const day = Math.floor(now / QUOTE_DAY_MS);
  const index =
    (((day * 137) % LEARNING_QUOTES.length) + LEARNING_QUOTES.length) %
    LEARNING_QUOTES.length;
  return LEARNING_QUOTES[index];
}

export function nextQuoteDelay(now: number = Date.now()): number {
  return (Math.floor(now / QUOTE_DAY_MS) + 1) * QUOTE_DAY_MS - now + 50;
}
