"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { PlaytimeGate } from "@/components/app/experience-quota";
import { TimeoutGate } from "@/components/app/timeout-gate";
import { ActivityPresence } from "@/components/app/activity-presence";
import { HostedActivity } from "./hosted-activity";
import { OnboardingGate } from "@/components/app/onboarding-gate";

/** Gate the /learn document itself, so opening its URL directly is metered too.
 * The third-party bundle remains sandboxed on its separate asset origin. */
export function MeteredActivity(props: { title: string; src: string }) {
  return (
    <ClerkProvider>
      <ConvexClientProvider>
        <OnboardingGate>
          <ActivityPresence />
          <TimeoutGate>
            {/* The app's frame around this page shows the warning. */}
            <PlaytimeGate placesWarning>
              <HostedActivity {...props} />
            </PlaytimeGate>
          </TimeoutGate>
        </OnboardingGate>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}
