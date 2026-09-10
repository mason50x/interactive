import type { ReactNode } from "react";

import { AppProviders } from "@/components/app-providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * The public site's frame: header above, footer below, the page between, and
 * the app's providers around all of it.
 *
 * Two route groups render this — `(site)` and `(legal)` — and they are two
 * groups for routing reasons that their own layouts explain, not because the
 * chrome differs. The one thing worth knowing here is that `min-h-dvh` on the
 * column is what pins a short page's footer to the bottom of the viewport.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
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
