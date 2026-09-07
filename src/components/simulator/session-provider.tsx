"use client";
import { useCallback, createContext, useContext, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import type { Program } from "@/lib/simulator/types";
import { writeProgram } from "@/lib/simulator/local-store";
const Context = createContext<{
  program: Program | null;
  setProgram: (p: Program | null) => Promise<void>;
  storageError: string;
} | null>(null);
function Session({ children, owner }: { children: ReactNode; owner: string | null | undefined }) {
  const [program, setCurrent] = useState<Program | null>(null);
  const [storageError, setStorageError] = useState("");
  const setProgram = useCallback(async (p: Program | null) => {
    setCurrent(p);
    setStorageError("");
    if (!p || !owner) return;
    try { await writeProgram(owner, p); }
    catch { setStorageError("This game can run, but could not be kept on this device. Select its file again after refreshing."); }
  }, [owner]);
  return (
    <Context.Provider value={{ program, setProgram, storageError }}>
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
  return <Session key={userId ?? "signed-out"} owner={userId}>{children}</Session>;
}
export function useSimulatorSession() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Simulator session is missing.");
  return ctx;
}
