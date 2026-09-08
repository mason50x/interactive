"use client";
import dynamic from "next/dynamic";
import { useAuth } from "@clerk/nextjs";
import { CenteredSpinner } from "@/components/ui/spinner";
const Player = dynamic(() => import("./html-player"), {
  ssr: false,
  loading: () => <CenteredSpinner />,
});
export function HtmlPlayerLoader({ contentHash }: { contentHash: string }) {
  const { userId } = useAuth();
  return userId ? (
    <Player
      key={`${userId}:${contentHash}`}
      owner={userId}
      contentHash={contentHash}
    />
  ) : (
    <CenteredSpinner />
  );
}
