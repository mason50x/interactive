import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { HtmlPlayerLoader } from "@/components/simulator/html-player-loader";
export const metadata: Metadata = { title: "HTML — Interactive Simulators" };
export default async function Page({ params }: { params: Promise<{ contentHash: string }> }) {
  await auth.protect();
  const { contentHash } = await params;
  if (!/^[a-f0-9]{64}$/.test(contentHash)) notFound();
  return <HtmlPlayerLoader contentHash={contentHash} />;
}
