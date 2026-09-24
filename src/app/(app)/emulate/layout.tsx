/** Every simulator route shares one session provider, so the player lock and
 *  the account's owner key survive moving between the library and a game. */
import type { ReactNode } from "react";
import { SimulatorSessionProvider } from "@/components/simulator/session-provider";
export default function SimulatorLayout({ children }: { children: ReactNode }) {
  return <SimulatorSessionProvider>{children}</SimulatorSessionProvider>;
}
