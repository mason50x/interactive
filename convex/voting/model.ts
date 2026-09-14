import { v } from "convex/values";

export const MIN_VOTES = 5;
export const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
export const status = v.union(v.literal("open"), v.literal("accepted"), v.literal("rejected"));
export const delivery = v.union(v.literal("pending"), v.literal("sending"), v.literal("sent"));
export const nominationFields = {
  name: v.string(),
  nameKey: v.string(),
  email: v.string(),
  authorClerkId: v.string(),
  status,
  yes: v.number(),
  no: v.number(),
  closesAt: v.number(),
  closedAt: v.optional(v.number()),
  delivery,
  sendingAt: v.optional(v.number()),
  approvedBy: v.optional(v.string()),
  clerkInvitationId: v.optional(v.string()),
};

/** Fold punctuation, whitespace, accents, and casing before comparing names.
 * This catches obvious self-nominations, not aliases or a forged identity. */
export function nameKey(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[\p{M}\p{P}\p{Z}\p{S}\p{C}]/gu, "");
}

export function matchesOwnName(name: string, names: (string | undefined)[]) {
  const key = nameKey(name);
  return Boolean(key) && names.some(value => Boolean(value) && nameKey(value!) === key);
}
