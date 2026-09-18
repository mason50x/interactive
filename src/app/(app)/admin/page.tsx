import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";

import { roleFor } from "../../../../config/roles";
import { QuotaConsole } from "@/components/app/admin/quota-console";
import { Page, PageDescription, PageTitle } from "@/components/ui/page";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) return notFound();
  if (roleFor(userId) !== "ceo") return notFound();

  return (
    <Page>
      <div>
        <PageTitle icon={<ShieldCheckIcon />}>Admin</PageTitle>
        <PageDescription className="mt-2">
          Restore service allowances globally or for an individual account.
        </PageDescription>
      </div>
      <QuotaConsole />
    </Page>
  );
}
