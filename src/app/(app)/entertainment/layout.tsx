import { auth } from "@clerk/nextjs/server";
import { EntertainmentSetup } from "@/components/app/tv/entertainment-setup";

export default async function EntertainmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();
  return <EntertainmentSetup>{children}</EntertainmentSetup>;
}
