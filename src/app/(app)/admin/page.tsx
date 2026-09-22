import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";

import { AdminConsole } from "@/components/app/admin/admin-console";
import { Page, PageTitle } from "@/components/ui/page";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await auth.protect();

  return (
    <Page>
      <PageTitle icon={<ShieldCheckIcon />}>Admin</PageTitle>
      <AdminConsole />
    </Page>
  );
}
