"use client";

import type { ReactNode } from "react";
import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { TimeoutMessage } from "@/components/app/timeout-message";

/** Unmount active frames and chat, rather than leaving them running under an overlay. */
export function TimeoutGate({ children }: { children: ReactNode }) {
  const timeout = useAuthedQuery(api.timeouts.mine, {});
  if (timeout === undefined)
    return (
      <div
        className="grid min-h-svh place-items-center bg-white text-black"
        role="status"
      >
        Checking access…
      </div>
    );
  if (timeout) return <TimeoutMessage {...timeout} />;
  return children;
}
