import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { AdminConsole } from "@/components/app/admin/admin-console";
import { Page } from "@/components/ui/page";
import styles from "@/components/app/admin/admin.module.css";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await auth.protect();
  return (
    <Page className={styles.page}>
      <AdminConsole />
    </Page>
  );
}
