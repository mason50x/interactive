import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExperienceChrome } from "@/components/app/experience-chrome";
import { experienceAppsFor, experienceSrc, findExperienceApp } from "@/lib/experience";
import { experienceAccessFor } from "@/lib/experience-access";

type Props = { params: Promise<{ app: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await auth();
  const { app } = await params;
  return { title: findExperienceApp(app, userId)?.label ?? "Experience" };
}

/**
 * One app, open. The page is the whole shell: the browser-shaped chrome and
 * the frame under it fill the dashboard's main column edge to edge.
 */
export default async function ExperienceAppPage({ params }: Props) {
  const { userId } = await auth.protect();

  const { app: id } = await params;
  const app = findExperienceApp(id, userId);
  if (!app) notFound();
  const accessToken = await experienceAccessFor(userId);

  return (
    <ExperienceChrome
      initialAppId={app.id}
      accessToken={accessToken}
      services={experienceAppsFor(userId).map((service) => ({
        ...service,
        src: service.id === "x" && !accessToken ? null : experienceSrc(service.start),
      }))}
    />
  );
}
