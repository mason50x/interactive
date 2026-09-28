import { protectPage } from "@/lib/session";
import type { Metadata } from "next";

import { Home } from "@/components/app/home/home";
import { Page } from "@/components/ui/page";

export const metadata: Metadata = { title: "Home" };

/** Where a signed-in session lands. See `Home`. */
export default async function HomePage() {
  await protectPage();
  return (
    <Page className="max-w-6xl gap-16 pt-14 page-sm:pt-20">
      <Home />
    </Page>
  );
}
