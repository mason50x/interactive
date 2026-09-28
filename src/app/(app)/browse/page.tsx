import { protectPage } from "@/lib/session";
import type { Metadata } from "next";
import { ExperienceChrome } from "@/components/app/experience-chrome";
import { experienceAppsFor, experienceSrc } from "@/lib/experience";
import { experienceAccessFor } from "@/lib/experience-access";

export const metadata: Metadata = { title: "Browse" };

export default async function ExperiencePage() {
  const { userId } = await protectPage();
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
