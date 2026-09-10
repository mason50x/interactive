/** One HTML simulation, addressed by the hash of its bytes. */
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { HtmlPlayerLoader } from "@/components/simulator/html-player-loader";
import { isContentHash } from "@/lib/simulator/content-hash";
export const metadata: Metadata = { title: "HTML — Interactive Simulators" };
export default async function Page({
  params,
}: PageProps<"/dashboard/learning-simulator/html/[contentHash]">) {
  await auth.protect();
  const { contentHash } = await params;
  if (!isContentHash(contentHash)) notFound();
  return <HtmlPlayerLoader contentHash={contentHash} />;
}
