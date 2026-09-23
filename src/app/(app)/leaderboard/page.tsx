import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { TrophyIcon } from "@heroicons/react/24/solid";
import { Leaderboard } from "@/components/app/leaderboard/leaderboard";
import { Page, PageTitle } from "@/components/ui/page";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  await auth.protect();
  return (
    <Page>
      <PageTitle icon={<TrophyIcon />}>Leaderboard</PageTitle>
      <Leaderboard />
    </Page>
  );
}
