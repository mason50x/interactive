"use client";
import dynamic from "next/dynamic";
import { CenteredSpinner } from "@/components/ui/spinner";
import type { Builtin } from "@/lib/simulator/types";
const Player = dynamic(() => import("./player"), {
  ssr: false,
  loading: () => <CenteredSpinner />,
});
export function PlayerLoader(props: {
  contentHash: string;
  builtin: Builtin | null;
}) {
  return <Player {...props} />;
}
