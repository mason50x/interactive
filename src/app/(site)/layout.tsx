import { SiteChrome } from "@/components/site-chrome";

/**
 * The public site's chrome: header above, footer below, the page between.
 *
 * It lives in a route group rather than in the root layout so `/auth` can opt
 * out of both and render its own split screen, and so `/learn` (an activity's
 * bare frame) never sees a header at all.
 *
 * There was an `EducationalOrganization` JSON-LD block here, which existed to
 * describe the site to search engines in the vocabulary they read. The site
 * is no longer describing itself to them — see `src/app/robots.ts` — and
 * structured data is the single richest thing an uninvited classifier can
 * lift off a page, so it went with the rest of the SEO surface.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return <SiteChrome>{children}</SiteChrome>;
}
