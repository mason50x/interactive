import { SiteChrome } from "@/components/site-chrome";

/**
 * The legal shell: the same chrome as the rest of the public site, around a
 * page that is meant to be read.
 *
 * It sits in its own route group rather than in `(site)` so the two documents
 * can be reasoned about on their own — nothing in here is marketing — while
 * still looking like they belong to the product that publishes them.
 *
 * `AppProviders` still mounts, so a signed-in reader keeps their accent and
 * so these pages are counted like every other page on the app host. What it
 * must never do is mount on `/learn`; see the note in that file.
 */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return <SiteChrome>{children}</SiteChrome>;
}
