"use client";

import { usePathname } from "next/navigation";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@convex/_generated/api";

/** Keep only the visible tab's current page fresh on the user's own row. */
export function ActivityPresence() {
  const path = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const heartbeat = useMutation(api.users.heartbeat);

  useEffect(() => {
    // The /learn player also mounts this component. Its embedded copy should
    // leave the parent dashboard page as the browser's reported location.
    if (!isAuthenticated || !path || window.self !== window.top) return;
    let timer: ReturnType<typeof setInterval> | undefined;

    function beat() {
      void heartbeat({ path }).catch((error) => {
        console.error("Activity presence update failed", error);
      });
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        if (timer === undefined) {
          beat();
          timer = setInterval(beat, 20_000);
        }
      } else if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    }

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer !== undefined) clearInterval(timer);
    };
  }, [heartbeat, isAuthenticated, path]);

  return null;
}
