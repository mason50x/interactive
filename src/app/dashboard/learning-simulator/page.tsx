import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { SimulatorLibrary } from "@/components/simulator/simulator-library";
export const metadata: Metadata = { title: "Interactive Simulators" };
export default async function Page() {
  await auth.protect();
  return <SimulatorLibrary />;
}
