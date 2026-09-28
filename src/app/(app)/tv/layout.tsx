import { protectPage } from "@/lib/session";
import { EntertainmentSetup } from "@/components/app/tv/entertainment-setup";

export default async function EntertainmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await protectPage();
  return <EntertainmentSetup>{children}</EntertainmentSetup>;
}
