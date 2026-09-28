import { protectPage } from "@/lib/session";
import type { Metadata } from "next";
import { PublishedHtmlPlayer } from "@/components/simulator/published-html-player";

export const metadata: Metadata = { title: "Published HTML — Simulators" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await protectPage();
  const { id } = await params;
  return <PublishedHtmlPlayer id={id} />;
}
