import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { ExperienceAppIcon } from "@/components/app/experience-app-icon";
import { EXPERIENCE_APPS, experienceAppHref } from "@/lib/experience";

export const metadata: Metadata = { title: "Experience" };

/**
 * Development only: the `.dev.tsx` name means `next build` never registers
 * this route (see `pageExtensions` in next.config.ts), so no deployment has
 * it, links to it, or bundles what it imports.
 *
 * The apps: every allowlist entry with a name and a front door, as a tile.
 * Opening one goes to `/dashboard/experience/<id>`, where it is framed inside
 * a browser-shaped shell. See `src/lib/experience.ts` for what makes an entry
 * an app.
 */
export default async function ExperiencePage() {
  // The layout guards the shell, but the router does not re-render a shared
  // layout between sibling pages, so every page under /dashboard guards itself.
  await auth.protect();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pt-8 pb-16 sm:px-8 lg:px-10">
      <h1 className="text-display text-display-title text-[2.25rem] sm:text-[2.75rem]">
        Experience
      </h1>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {EXPERIENCE_APPS.map((app) => (
          <li key={app.id}>
            <Link
              href={experienceAppHref(app.id)}
              prefetch={false}
              className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-background px-4 py-6 text-center transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="flex size-16 items-center justify-center rounded-2xl bg-muted">
                <ExperienceAppIcon id={app.id} className="size-10" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{app.label}</span>
                <span className="text-xs text-muted-foreground">{app.host}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
