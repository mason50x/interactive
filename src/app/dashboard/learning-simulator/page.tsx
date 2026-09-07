import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { hasAgreed } from "@/lib/agreement-gate";
import { AgreementRequired } from "@/components/app/agreement-required";
import { SimulatorLibrary } from "@/components/simulator/library";
export const metadata: Metadata = { title: "Learning Simulator" };
export default async function Page() {
  await auth.protect();
  if (!(await hasAgreed()))
    return <AgreementRequired title="Learning Simulator" />;
  return <SimulatorLibrary />;
}
