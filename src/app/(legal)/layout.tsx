import { AppProviders } from "@/components/app-providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

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
  return (
    <AppProviders>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </AppProviders>
  );
}
