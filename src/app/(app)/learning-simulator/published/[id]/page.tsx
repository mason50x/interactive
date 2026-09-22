import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { PublishedHtmlPlayer } from "@/components/simulator/published-html-player";

export const metadata: Metadata = { title: "Published HTML — Simulators" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await auth.protect();
  const { id } = await params;
  return <PublishedHtmlPlayer id={id} />;
}
