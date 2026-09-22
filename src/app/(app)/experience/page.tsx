import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ExperienceChrome } from "@/components/app/experience-chrome";
import { experienceAppsFor, experienceSrc } from "@/lib/experience";
import { experienceAccessFor } from "@/lib/experience-access";

export const metadata: Metadata = { title: "Experience" };

export default async function ExperiencePage() {
  const { userId } = await auth.protect();
  const accessToken = await experienceAccessFor(userId);
  return (
    <ExperienceChrome
      accessToken={accessToken}
      services={experienceAppsFor(userId).map((app) => ({
        ...app,
        src: app.id === "x" && !accessToken ? null : experienceSrc(app.start),
      }))}
    />
  );
}
