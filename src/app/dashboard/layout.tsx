import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app/app-header";
import { AppProviders } from "@/components/app-providers";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s — Dashboard" },
  // Nothing behind a session is indexable; robots.ts disallows /dashboard to
  // match, so a crawler never even asks.
  robots: { index: false, follow: false },
};

/**
 * The signed-in app shell.
 *
 * Living at the top level rather than inside the `(site)` route group is what
 * keeps the marketing header and footer off these pages — that chrome belongs
 * to the group's layout, exactly as `/auth` opts out of it.
 *
 * The shape is a viewport-height column that never scrolls itself: the bar on
 * top holds its place because nothing moves it, and the shell beneath it is
 * the only scroll container on the page. That is also why the whole chain
 * carries `min-h-0` — a flex child defaults to `min-height: auto`, which
 * refuses to shrink below its content and would push the overflow back out to
 * the document, taking the header with it.
 *
 * `auth.protect()` here covers the shell and anything a future page forgets to
 * guard on a full page load. It is a floor, not the guarantee: the router does
 * not re-render a shared layout when you navigate between pages beneath it, so
 * every page under `/dashboard` has to call `auth.protect()` for itself.
 */
export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  await auth.protect();

  return (
    <AppProviders>
      <div className="flex h-svh min-h-0 flex-col overflow-hidden">
        <AppHeader />
        <main className="shell-inset mx-3 mb-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface sm:mx-4 sm:mb-4">
          {children}
        </main>
      </div>
    </AppProviders>
  );
}
