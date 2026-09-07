import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { PhilosophyAnimation } from "@/components/app/philosophy-animation";

export const metadata: Metadata = { title: "Our Philosophy" };

export default async function PhilosophyPage() {
  await auth.protect();

  return <PhilosophyAnimation />;
}
