import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { findSettingsSection } from "@/components/app/settings/sections";

export async function generateMetadata({
  params,
}: PageProps<"/settings/[section]">): Promise<Metadata> {
  const { section } = await params;
  const entry = findSettingsSection(section);
  return { title: entry ? `Settings \\ ${entry.label}` : "Settings" };
}

/** One Settings tab. */
export default async function SettingsSection({
  params,
}: PageProps<"/settings/[section]">) {
  await auth.protect();
  const { section } = await params;
  const entry = findSettingsSection(section);
  if (!entry) notFound();
  return <entry.Component />;
}
