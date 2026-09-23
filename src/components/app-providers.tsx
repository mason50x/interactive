import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { GoogleAnalytics } from "@/components/google-analytics";
import { PreferencesProvider } from "@/components/preferences-provider";
import { StoreUser } from "@/components/store-user";
import { ActivityPresence } from "@/components/app/activity-presence";

/** Shared providers for the main app. The /learn player uses only the auth and
 * Convex providers it needs for its live playtime gate, without analytics. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <ClerkProvider
        appearance={{
          elements: { logoImage: { filter: "var(--clerk-logo-filter, none)" } },
        }}
      >
        <ConvexClientProvider>
          {/* Inside Convex, because the settings *are* a Convex subscription,
            and inside Clerk, because whose settings they are depends on the
            session. It wraps the children rather than sitting beside them:
            the accent and the panic key apply to the whole tree. */}
          <PreferencesProvider>
            <StoreUser />
            <ActivityPresence />
            {children}
            <GoogleAnalytics />
          </PreferencesProvider>
        </ConvexClientProvider>
      </ClerkProvider>
    </>
  );
}
