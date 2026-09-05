import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasAgreed } from "@/lib/agreement-gate";
import { AgreementRequired } from "@/components/app/agreement-required";
import { findBuiltin } from "@/lib/simulator/catalogue";
import { PlayerLoader } from "@/components/simulator/player-loader";
export const metadata: Metadata = { title: "Learning Simulator" };
export default async function Page({
  params,
}: {
  params: Promise<{ contentHash: string }>;
}) {
  await auth.protect();
  const { contentHash } = await params;
  if (!/^[a-f0-9]{64}$/.test(contentHash)) notFound();
  if (!(await hasAgreed()))
    return <AgreementRequired title="Learning Simulator" />;
  return (
    <PlayerLoader
      key={contentHash}
      contentHash={contentHash}
      builtin={findBuiltin(contentHash)}
    />
  );
}
