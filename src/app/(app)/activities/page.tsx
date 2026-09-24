import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ActivitiesBrowser } from "@/components/app/activities-browser";
import { Page } from "@/components/ui/page";

export const metadata: Metadata = { title: "Activities" };

/**
 * The catalogue, using the shared dashboard page width and gutters.
 */
export default async function ActivitiesPage() {
  // The layout guards the shell, but the router does not re-render a shared
  // layout between sibling pages, so every page in the signed-in app guards itself.
  await auth.protect();

  return (
    <Page>
      {/* The catalogue reaches the browser from the dashboard layout's
          `ActivitiesProvider`, not as a prop here — once per full load,
          behind the layout's own `auth.protect()`, and not again for this
          page. `src/lib/activities.ts` has the reasoning. */}
      <ActivitiesBrowser />
    </Page>
  );
}
