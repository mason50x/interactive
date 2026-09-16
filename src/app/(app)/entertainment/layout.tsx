import { canAccessEntertainment } from "@/lib/entertainment-access";
import { EntertainmentSoon } from "@/components/app/tv/entertainment-soon";
import { EntertainmentSetup } from "@/components/app/tv/entertainment-setup";

export default async function EntertainmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await canAccessEntertainment())) return <EntertainmentSoon />;
  return <EntertainmentSetup>{children}</EntertainmentSetup>;
}
