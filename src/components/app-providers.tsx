import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { GoogleAnalytics } from "@/components/google-analytics";
import { PreferencesProvider } from "@/components/preferences-provider";
import { StoreUser } from "@/components/store-user";

/**
 * Everything the app needs and an activity must never get.
 *
 * This sits in the three route trees that make up the app — `(site)`, `/auth`,
 * `/dashboard` — rather than in the root layout, because the root layout also
 * wraps `/learn`, the shell an activity is framed in. That shell is deliberately
 * bare (see `src/app/learn/layout.tsx`): mounting `ClerkProvider` there would
 * load Clerk's script and a Convex client into a page whose only job is to
 * hold an iframe, none of which the framed bundle should find waiting for it.
 *
 * Analytics rides along for the same reason. An activity frame firing its own
 * pageviews would double-count every session.
 *
 * The accent's pre-paint script is the one thing that could not follow that
 * rule. It belongs beside the theme's in the root layout — see `preferencesScript`,
 * which skips `/learn` itself — because a `<script>` mounted here is created by
 * React on the client the moment a navigation re-renders this tree, and a
 * script element React creates is never executed.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <ClerkProvider>
        <ConvexClientProvider>
          {/* Inside Convex, because the settings *are* a Convex subscription,
            and inside Clerk, because whose settings they are depends on the
            session. It wraps the children rather than sitting beside them:
            the accent and the panic key apply to the whole tree. */}
          <PreferencesProvider>
            <StoreUser />
            {children}
            <GoogleAnalytics />
          </PreferencesProvider>
        </ConvexClientProvider>
      </ClerkProvider>
    </>
  );
}
