import { auth } from "@clerk/nextjs/server";

import { SettingsShell } from "@/components/app/settings/settings-shell";
import { Page } from "@/components/ui/page";

/** The frame every Settings tab shares. See `SettingsShell`. */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();
  return (
    <Page className="max-w-5xl pt-10 sm:pt-12">
      <SettingsShell>{children}</SettingsShell>
    </Page>
  );
}
