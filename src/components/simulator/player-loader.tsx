"use client";
import dynamic from "next/dynamic";
import type { Builtin } from "@/lib/simulator/types";
const Player = dynamic(() => import("./player"), {
  ssr: false,
  loading: () => (
    <p className="p-8 text-muted-foreground">Preparing simulator…</p>
  ),
});
export function PlayerLoader(props: {
  contentHash: string;
  builtin: Builtin | null;
}) {
  return <Player {...props} />;
}
