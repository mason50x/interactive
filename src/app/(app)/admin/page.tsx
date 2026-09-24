import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";

import { AdminConsole } from "@/components/app/admin/admin-console";
import { Page } from "@/components/ui/page";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await auth.protect();

  return (
    <Page>
      <AdminConsole />
    </Page>
  );
}
