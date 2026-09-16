import { expect, test } from "vitest";
import {
  LEARNING_QUOTES,
  dailyLearningQuote,
  nextQuoteDelay,
  QUOTE_DAY_MS,
} from "../../src/lib/learning-quotes";

test("525 distinct original one-liners fit a compact card", () => {
  expect(LEARNING_QUOTES).toHaveLength(525);
  expect(new Set(LEARNING_QUOTES).size).toBe(525);
  expect(
    LEARNING_QUOTES.every((quote) => quote.length > 20 && quote.length < 140),
  ).toBe(true);
});

test("everyone gets the same quote throughout a UTC day and a new one at midnight", () => {
  const midnight = Date.parse("2026-09-16T00:00:00Z");
  expect(dailyLearningQuote(midnight)).toBe(
    dailyLearningQuote(midnight + QUOTE_DAY_MS - 1),
  );
  expect(dailyLearningQuote(Date.parse("2026-09-16T09:00:00+09:00"))).toBe(
    dailyLearningQuote(midnight),
  );
  expect(dailyLearningQuote(midnight + QUOTE_DAY_MS)).not.toBe(
    dailyLearningQuote(midnight),
  );
  expect(nextQuoteDelay(midnight + QUOTE_DAY_MS - 1000)).toBe(1050);
});

test("every quote appears once per 525-day cycle", () => {
  const start = Date.parse("2026-09-16T00:00:00Z");
  const cycle = LEARNING_QUOTES.map((_, day) =>
    dailyLearningQuote(start + day * QUOTE_DAY_MS),
  );
  expect(new Set(cycle).size).toBe(LEARNING_QUOTES.length);
  expect(dailyLearningQuote(start + 525 * QUOTE_DAY_MS)).toBe(cycle[0]);
});
