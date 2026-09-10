/**
 * A simulator entry is addressed by the SHA-256 of its bytes, written as
 * sixty-four hex digits. Anything else in that route segment is not an entry
 * and never was, so the pages `notFound()` before asking anybody.
 */
const CONTENT_HASH = /^[a-f0-9]{64}$/;

export function isContentHash(value: string): boolean {
  return CONTENT_HASH.test(value);
}
