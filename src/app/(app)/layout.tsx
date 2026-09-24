import {
  PlaytimeStatusProvider,
  PlaytimeRouteGate,
} from "@/components/app/playtime-status";
import { TimeoutGate } from "@/components/app/timeout-gate";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ChatProvider } from "@/components/app/chat/chat-provider";
import { AppHeader } from "@/components/app/app-header";
import { PlaytimeActivityProvider } from "@/components/app/playtime-activity";
import { ActivitiesProvider } from "@/components/app/activities-provider";
import { AppProviders } from "@/components/app-providers";
import { CLIENT_ACTIVITIES } from "@/lib/activities";

export const metadata: Metadata = {
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
 * The shape is a viewport-height column that never scrolls itself. The header
 * holds its place because nothing can move it, and the shell beneath it is the
 * only scroll container on the page — which is also why it carries `min-h-0`:
 * a flex child defaults to `min-height: auto` and refuses to shrink below its
 * content, which would push the overflow back out to the document and take
 * the header with it.
 *
 * Two surfaces, one step apart. The chrome — the header and the margin around
 * the rest of the shell — is `--sidebar`, and the shell is the lighter
 * `--surface`, held off it by a hairline border and nothing else. The shell
 * being the lighter of the two in both themes is what makes it the page and
 * the chrome the frame; the border is all the separation that needs, and the
 * cards inside sit on white without a second shadow under them.
 *
 * The header's own `px-3` matches the shell's side margins, so the bar's
 * first and last controls line up with the shell's edges. See `AppHeader`.
 *
 * `auth.protect()` here covers the shell and anything a future page forgets to
 * guard on a full page load. It is a floor, not the guarantee: the router does
 * not re-render a shared layout when you navigate between pages beneath it, so
 * every page in the signed-in app has to call `auth.protect()` for itself.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();

  return (
    <AppProviders>
      {/* Wraps both the header and shell: the
            unread dot is on a row in the header, and the conversations it counts
            are read on a page in the shell. Mounted here rather than inside
            `/chat` so the dot is right while you are looking at an
            activity, which is the only time it is worth having. */}
      <TimeoutGate>
        <ChatProvider>
          {/* The catalogue for the activities grid. This is the *only* way it reaches a
              browser — as data in this layout's RSC payload, behind the
              `auth.protect()` above — because `@/lib/activities` is
              `server-only` and a client module importing it would publish
              every entry to a static chunk with no session in front of it.
              Here rather than on each page so it is serialised once per full
              load and never on a navigation. See `ActivitiesProvider`. */}
          <ActivitiesProvider activities={CLIENT_ACTIVITIES}>
            <PlaytimeActivityProvider>
              <PlaytimeStatusProvider>
                <div className="flex h-svh flex-col overflow-hidden bg-sidebar">
                  <AppHeader />
                  <main className="mx-3 mb-3 min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface">
                    <PlaytimeRouteGate>{children}</PlaytimeRouteGate>
                  </main>
                </div>
              </PlaytimeStatusProvider>
            </PlaytimeActivityProvider>
          </ActivitiesProvider>
        </ChatProvider>
      </TimeoutGate>
    </AppProviders>
  );
}
