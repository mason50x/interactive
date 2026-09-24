import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { Leaderboard } from "@/components/app/leaderboard/leaderboard";
import { Page } from "@/components/ui/page";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  await auth.protect();
  return (
    <Page>
      <Leaderboard />
    </Page>
  );
}
