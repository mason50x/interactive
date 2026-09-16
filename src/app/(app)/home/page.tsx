import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";

import { Greeting } from "@/components/app/home/greeting";
import { GameShelves } from "@/components/app/home/game-shelves";
import { HomeIconSolid } from "@/components/app/nav-icons";
import { Page, PageTitle } from "@/components/ui/page";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  await auth.protect();
  return (
    <Page>
      <div>
        <PageTitle icon={<HomeIconSolid />}>Home</PageTitle>
        <Greeting />
      </div>
      <GameShelves />
    </Page>
  );
}
