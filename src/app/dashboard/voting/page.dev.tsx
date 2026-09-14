import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { VotingPage } from "@/components/app/voting/voting-page";

export const metadata: Metadata = { title: "Voting" };

export default async function VotingRoute() {
  await auth.protect();
  return <VotingPage />;
}
