import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ActivitiesBrowser } from "@/components/app/activities-browser";
import { GAMES, SHELVES } from "@/lib/games";

export const metadata: Metadata = { title: "Activities" };

/**
 * The catalogue.
 *
 * Wider than the rest of the dashboard — `max-w-6xl` against everyone else's
 * `max-w-5xl` — because this is the one page whose content is rows of art
 * rather than a column of prose. The extra measure is a third card visible in
 * each shelf before you scroll.
 */
export default async function ActivitiesPage() {
  // The layout guards the shell, but the router does not re-render a shared
  // layout between sibling pages, so every page under /dashboard guards itself.
  await auth.protect();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-12 pb-16 sm:px-10">
      <div>
        <h1 className="text-display text-[2rem]">Activities</h1>
        <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
          {GAMES.length} of them, across {SHELVES.length} kinds. Everything runs
          in a sandboxed frame on a separate origin, so nothing here can reach
          your account.
        </p>
      </div>

      <ActivitiesBrowser />
    </div>
  );
}
