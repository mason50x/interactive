import { AppProviders } from "@/components/app-providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * The marketing/app chrome. It lives in a route group rather than in the root
 * layout so `/auth` can opt out of the header and footer entirely and render
 * its own full-bleed split screen.
 *
 * There was an `EducationalOrganization` JSON-LD block here, which existed to
 * describe the site to search engines in the vocabulary they read. The site
 * is no longer describing itself to them — see `src/app/robots.ts` — and
 * structured data is the single richest thing an uninvited classifier can
 * lift off a page, so it went with the rest of the SEO surface.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <AppProviders>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </AppProviders>
  );
}
