"use client";

import { usePathname } from "next/navigation";
import { footer } from "@/lib/content";

/**
 * The fine print at the very foot of the landing page: a line saying that
 * the page above is a demonstration, so nobody reads its numbers, quotes, or
 * the trust strip's logos as claims of fact or affiliation.
 *
 * The footer is one component shared by every public page, and this line is
 * about the landing page alone, so it reads the pathname and renders nowhere
 * else. That read is the only reason it is a client component.
 */
export function LandingDisclaimer() {
  const pathname = usePathname();
  if (pathname !== "/") return null;

  return (
    <p className="max-w-3xl text-[0.625rem] leading-relaxed text-faint/80">
      {footer.landingDisclaimer}
    </p>
  );
}
