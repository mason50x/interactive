import { withoutTrailingSlash } from "@/lib/origin";

/** Invitation redirects use a configured origin, never an untrusted Host header. */
export function siteUrl(): string {
  // SITE_URL permits a runtime staging origin independent of public metadata.
  const explicit = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) {
    const url = new URL(explicit);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("SITE_URL must be an HTTP(S) origin");
    }
    return withoutTrailingSlash(url.origin);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Set SITE_URL or NEXT_PUBLIC_SITE_URL before sending invitations",
    );
  }
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
