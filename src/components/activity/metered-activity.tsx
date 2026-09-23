"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { PlaytimeGate } from "@/components/app/experience-quota";
import { TimeoutGate } from "@/components/app/timeout-gate";
import { HostedActivity } from "./hosted-activity";

/** Gate the /learn document itself, so opening its URL directly is metered too.
 * The third-party bundle remains sandboxed on its separate asset origin. */
export function MeteredActivity(props: { title: string; src: string }) {
  return (
    <ClerkProvider>
      <ConvexClientProvider>
        <TimeoutGate>
          <PlaytimeGate>
            <HostedActivity {...props} />
          </PlaytimeGate>
        </TimeoutGate>
      </ConvexClientProvider>
    </ClerkProvider>
  );
}
