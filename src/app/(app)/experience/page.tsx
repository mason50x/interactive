import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ExperienceChrome } from "@/components/app/experience-chrome";
import { EXPERIENCE_APPS, experienceSrc } from "@/lib/experience";

export const metadata: Metadata = { title: "Experience" };

export default async function ExperiencePage() {
  await auth.protect();
  return (
    <ExperienceChrome
      services={EXPERIENCE_APPS.map((app) => ({
        ...app,
        src: experienceSrc(app.start),
      }))}
    />
  );
}
