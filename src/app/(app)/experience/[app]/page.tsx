import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExperienceChrome } from "@/components/app/experience-chrome";
import { EXPERIENCE_APPS, experienceSrc, findExperienceApp } from "@/lib/experience";

type Props = { params: Promise<{ app: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { app } = await params;
  return { title: findExperienceApp(app)?.label ?? "Experience" };
}

/**
 * One app, open. The page is the whole shell: the browser-shaped chrome and
 * the frame under it fill the dashboard's main column edge to edge.
 */
export default async function ExperienceAppPage({ params }: Props) {
  await auth.protect();

  const { app: id } = await params;
  const app = findExperienceApp(id);
  if (!app) notFound();

  return (
    <ExperienceChrome
      initialAppId={app.id}
      services={EXPERIENCE_APPS.map((service) => ({
        ...service,
        src: experienceSrc(service.start),
      }))}
    />
  );
}
