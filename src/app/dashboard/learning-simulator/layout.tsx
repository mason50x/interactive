import type { ReactNode } from "react";
import { SimulatorSessionProvider } from "@/components/simulator/session-provider";
export default function SimulatorLayout({ children }: { children: ReactNode }) {
  return <SimulatorSessionProvider>{children}</SimulatorSessionProvider>;
}
