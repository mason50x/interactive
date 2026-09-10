/**
 * Protect concrete private contact details without blocking ordinary links,
 * platform names, streaming discussion, or invitations to play together.
 */
export type PatternCategory = "contact" | "link" | "location";
export type PatternHit = { rule: string; category: PatternCategory };

const EMAIL = /[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){1,4}/i;
const STREET = /\b\d{1,5}\s{1,2}[a-z]{2,20}(?:\s{1,2}[a-z]{2,20}){0,3}\s{1,2}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way|circle|cir|place|pl|terrace|parkway)\b/i;
const PHONE_CONTEXT = /\b(?:phone|mobile|cell|call me|text me|my number|their number|his number|her number)\b/i;
const PHONE = /(?:\+?\d[\d ()+.-]{5,30}\d)/g;

/** Numbers need contact context: scores, dates and calculations are ordinary text. */
export function findPatterns(clean: string): PatternHit[] {
  const hits: PatternHit[] = [];
  if (EMAIL.test(clean)) hits.push({ rule: "email", category: "contact" });
  if (STREET.test(clean)) hits.push({ rule: "address", category: "location" });
  if (PHONE_CONTEXT.test(clean)) {
    for (const match of clean.matchAll(PHONE)) {
      const digits = match[0].replace(/\D/g, "").length;
      if (digits >= 7 && digits <= 15) {
        hits.push({ rule: "phone", category: "contact" });
        break;
      }
    }
  }
  return hits;
}
