import { protectPage } from "@/lib/session";
import type { Metadata } from "next";

import { AdminConsole } from "@/components/app/admin/admin-console";
import { Page } from "@/components/ui/page";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await protectPage();

  return (
    <Page>
      <AdminConsole />
    </Page>
  );
}
