import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findBuiltin } from "@/lib/simulator/catalogue";
import { PlayerLoader } from "@/components/simulator/player-loader";
export const metadata: Metadata = { title: "Interactive Simulators" };
export default async function Page({
  params,
}: {
  params: Promise<{ contentHash: string }>;
}) {
  await auth.protect();
  const { contentHash } = await params;
  if (!/^[a-f0-9]{64}$/.test(contentHash)) notFound();
  return (
    <PlayerLoader
      key={contentHash}
      contentHash={contentHash}
      builtin={findBuiltin(contentHash)}
    />
  );
}
