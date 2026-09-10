/**
 * Reading an origin out of the environment, for the three places that do it.
 *
 * The candidates are tried in order and the first one that *parses* wins,
 * rather than the first one that exists. The difference is not academic:
 * `vercel env pull` writes the literal string `[SENSITIVE]` for a variable
 * marked as a Secret, and a variable holding a public hostname gets marked
 * that way easily — the CLI defaults to it for anything unprefixed.
 * Preferring an unparseable value over a working one behind it would take
 * every hosted activity off the site, with the valid origin sitting unused in
 * the next variable along.
 *
 * A malformed value would otherwise surface as every tile showing a broken
 * image and every frame a 404, with nothing naming the cause; `null` is the
 * answer callers can check for.
 */
export function originFromEnv(
  ...candidates: (string | undefined)[]
): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(withoutTrailingSlash(candidate)).origin;
    } catch {
      continue;
    }
  }
  return null;
}

/** `https://example.org/` as `https://example.org`, for joining a path to. */
export function withoutTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}
