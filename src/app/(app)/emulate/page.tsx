/** The simulator library: what the reader has brought, in either format. */
import { protectPage } from "@/lib/session";
import type { Metadata } from "next";
import { SimulatorLibrary } from "@/components/simulator/simulator-library";
export const metadata: Metadata = { title: "Emulate" };
export default async function Page() {
  await protectPage();
  return <SimulatorLibrary />;
}
