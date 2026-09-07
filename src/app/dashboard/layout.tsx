import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ChatProvider } from "@/components/app/chat/chat-provider";
import { AppSidebar } from "@/components/app/app-sidebar";
import { BrowserCheck } from "@/components/app/browser-check";
import { SearchProvider } from "@/components/app/search-provider";
import { AppProviders } from "@/components/app-providers";
import { StreakProvider } from "@/components/streak-provider";
import { ACTIVITIES } from "@/lib/activities";
import { RAIL_COOKIE, railState } from "@/lib/rail";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s — Dashboard" },
  // Nothing behind a session is indexable. This is now the same answer the
  // root layout gives, but it stays written out: a nested `robots` overrides
  // rather than merges, so deleting it would not inherit the root's — it
  // would leave these pages with the root's and nothing of their own to say.
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
 * Two surfaces, one step apart. The chrome — the rail and the margin all the
 * way around the shell — is `--sidebar`, and the shell is the lighter
 * `--surface`, held off it by a hairline border and nothing else. The shell
 * being the lighter of the two in both themes is what makes it the page and
 * the chrome the frame; the border is all the separation that needs, and the
 * cards inside sit on white without a second shadow under them.
 *
 * The shell's margin is the same at every size on purpose: the rail's rows
 * run flush to its right edge and rely on this margin to be the chrome on that
 * side, matching the padding on their left. A margin that grew at `lg` would
 * leave every hover blob in the rail sitting left of centre. See
 * `AppSidebar`.
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

  // The rail's width, for the same reason: drawn at the remembered width in
  // the first frame rather than sliding there once React is up. See
  // `src/lib/rail.ts`.
  const rail = railState((await cookies()).get(RAIL_COOKIE)?.value);

  // The catalogue, narrowed to what a result row needs, so the rail's search
  // can find an activity from any page of the app rather than only from the one
  // that already has the shelves. This is the *only* way the index reaches a
  // browser — as data in this layout's RSC payload, behind the `auth.protect()`
  // above — because `@/lib/activities` is `server-only` and a client module
  // importing it would publish all 318 entries to a static chunk with no
  // session in front of it. See that file's header.
  const activities = ACTIVITIES.map(({ slug, title, genre }) => ({
    slug,
    title,
    genre,
  }));

  return (
    <AppProviders>
      <BrowserCheck />
      {/* Here and not in `AppProviders`, which also wraps the marketing site
          and the auth pages: arriving at the app is a day's activity, reading
          the pricing page is not. */}
      <StreakProvider>
        {/* Wraps both the rail and shell: the
            unread dot is on a row in the rail, and the conversations it counts
            are read on a page in the shell. Mounted here rather than inside
            `/dashboard/chat` so the dot is right while you are looking at an
            activity, which is the only time it is worth having. */}
        <ChatProvider>
          {/* Carries the catalogue to the rail's search box without a
              client import of the index. See `SearchProvider`. */}
          <SearchProvider activities={activities}>
            <div className="flex h-svh overflow-hidden bg-sidebar">
              <AppSidebar initialRail={rail} />
              <main className="m-3 min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface">
                {children}
              </main>
            </div>
          </SearchProvider>
        </ChatProvider>
      </StreakProvider>
    </AppProviders>
  );
}
