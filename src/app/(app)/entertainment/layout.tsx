import { EntertainmentSetup } from "@/components/app/tv/entertainment-setup";

export default function EntertainmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EntertainmentSetup>{children}</EntertainmentSetup>;
}
