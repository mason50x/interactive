import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExperienceChrome } from "@/components/app/experience-chrome";
import { experienceSrc, findExperienceApp } from "@/lib/experience";

/**
 * Typed by hand rather than with `PageProps<...>`: this file is a route only
 * under `next dev` (see `pageExtensions` in next.config.ts), so the generated
 * route types have no entry for it in a production type check.
 */
type Props = { params: Promise<{ app: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { app } = await params;
  return { title: findExperienceApp(app)?.label ?? "Experience" };
}

/**
 * One app, open. The page is the whole shell: the browser-shaped chrome and
 * the frame under it fill the dashboard's main column edge to edge.
 *
 * Development only. The `.dev.tsx` name keeps this route out of every build.
 */
export default async function ExperienceAppPage({ params }: Props) {
  await auth.protect();

  const { app: id } = await params;
  const app = findExperienceApp(id);
  if (!app) notFound();

  const src = experienceSrc(app.start);
  if (!src) {
    return (
      <div className="mx-auto max-w-prose px-6 py-16 text-sm text-muted-foreground">
        No experience origin is configured for this deployment. Set{" "}
        <code>EXPERIENCE_ORIGIN</code> to the Worker&rsquo;s origin; see{" "}
        <code>config/domains.md</code>.
      </div>
    );
  }

  return <ExperienceChrome app={app} src={src} />;
}
