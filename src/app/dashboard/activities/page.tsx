import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ActivitiesBrowser } from "@/components/app/activities-browser";
import { Page, PageTitle } from "@/components/ui/page";

export const metadata: Metadata = { title: "Activities" };

/**
 * The catalogue.
 *
 * Wider than the rest of the dashboard — `max-w-7xl` against everyone else's
 * `max-w-5xl` — because this is the one page whose content is a field of art
 * rather than a column of prose. Prose stops being readable past a measure;
 * a grid of three thumbnails only gets better, and the extra width is spent
 * on the tiles themselves rather than on a fourth column of smaller ones.
 */
export default async function ActivitiesPage() {
  // The layout guards the shell, but the router does not re-render a shared
  // layout between sibling pages, so every page under /dashboard guards itself.
  await auth.protect();

  return (
    <Page>
      <PageTitle>Activities</PageTitle>

      {/* The catalogue reaches the browser from the dashboard layout's
          `ActivitiesProvider`, not as a prop here — once per full load,
          behind the layout's own `auth.protect()`, and not again for this
          page. `src/lib/activities.ts` has the reasoning. */}
      <ActivitiesBrowser />
    </Page>
  );
}
