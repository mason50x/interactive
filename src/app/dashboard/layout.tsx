import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { AppSidebar } from "@/components/app/app-sidebar";
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
 * The shape is a viewport-height row that never scrolls itself. The rail holds
 * its place because nothing can move it, and the shell beside it is the only
 * scroll container on the page — which is also why it carries `min-h-0`: a
 * flex child defaults to `min-height: auto` and refuses to shrink below its
 * content, which would push the overflow back out to the document and take
 * the rail with it.
 *
 * The two surfaces run the opposite way to the usual card on a page. The
 * chrome — the rail and the margin all the way around the shell — is one
 * unbroken white sheet (`--surface`), and the only thing that is not white is
 * the shell itself, which takes the page colour the landing uses
 * (`--background`). Being the darker of the two in both themes is what lets
 * it read as a well pressed into the sheet rather than a card floating on
 * top, and it gives the white cards inside it something to sit on.
 *
 * The shell's margin is the same at every size on purpose. It is half of the
 * rail's right-hand gutter — the rail pads its own contents by the other
 * half — so a margin that grew at `lg` would pull the two out of step and
 * leave everything in the rail sitting left of centre. See `AppSidebar`.
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
      <div className="flex h-svh overflow-hidden bg-surface">
        <AppSidebar />
        <main className="shell-inset m-3 min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-background">
          {children}
        </main>
      </div>
    </AppProviders>
  );
}
