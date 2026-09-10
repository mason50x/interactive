/** One Game Boy simulation, addressed by the hash of its bytes. */
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findBuiltin } from "@/lib/simulator/catalogue";
import { PlayerLoader } from "@/components/simulator/player-loader";
import { isContentHash } from "@/lib/simulator/content-hash";
export const metadata: Metadata = { title: "Interactive Simulators" };
export default async function Page({
  params,
}: PageProps<"/dashboard/learning-simulator/[contentHash]">) {
  await auth.protect();
  const { contentHash } = await params;
  if (!isContentHash(contentHash)) notFound();
  return (
    <PlayerLoader
      key={contentHash}
      contentHash={contentHash}
      builtin={findBuiltin(contentHash)}
    />
  );
}
