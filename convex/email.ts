/**
 * Email addresses as keys.
 *
 * Both the invite allowance and the voting board store an address and later
 * look rows up by it — from a duplicate check, and from the `user.created`
 * webhook that reports the address Clerk saw. An invitation to
 * `Sam@Example.com` has to be the same row Clerk later reports as
 * `sam@example.com`, so every address is folded the same way before it is
 * stored or compared.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Enough to catch a typo before spending a round trip on Clerk, which does
 * the authoritative validation and would reject a malformed address anyway.
 */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
