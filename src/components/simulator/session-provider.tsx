"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import type { Program } from "@/lib/simulator/types";
const Context = createContext<{
  program: Program | null;
  setProgram: (p: Program | null) => void;
} | null>(null);
function Session({ children }: { children: ReactNode }) {
  const [program, setProgram] = useState<Program | null>(null);
  return (
    <Context.Provider value={{ program, setProgram }}>
      {children}
    </Context.Provider>
  );
}
export function SimulatorSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { userId } = useAuth();
  return <Session key={userId ?? "signed-out"}>{children}</Session>;
}
export function useSimulatorSession() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Simulator session is missing.");
  return ctx;
}
