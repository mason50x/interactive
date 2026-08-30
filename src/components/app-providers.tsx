import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { GoogleAnalytics } from "@/components/google-analytics";
import { StoreUser } from "@/components/store-user";
import { ThemeProvider } from "@/components/theme-provider";

/**
 * Everything the app needs and a game must never get.
 *
 * This sits in the three route trees that make up the app — `(site)`, `/auth`,
 * `/dashboard` — rather than in the root layout, because the root layout also
 * wraps `/player`. Mounting `ClerkProvider` there would load Clerk's script on
 * the player origin and set its cookies there, which is precisely the thing
 * the separate origin exists to prevent: `src/lib/player.ts` has the reasoning.
 *
 * Analytics rides along for the same reason. A game frame firing its own
 * pageviews would double-count every session.
 *
 * The theme is here rather than in the root layout for a third reason: the
 * *application* of a theme belongs to every route (the root layout's inline
 * script does that, player included), but the ability to read and change one
 * is only ever used by app chrome.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <ConvexClientProvider>
        <ThemeProvider>
          <StoreUser />
          {children}
          <GoogleAnalytics />
        </ThemeProvider>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}
