"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
  type ComponentProps,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PlaytimeSidebar, useExperienceQuota } from "./experience-quota";
import { isPlaytimeRoute } from "@config/playtime";

const StatusContext = createContext<ReturnType<
  typeof useExperienceQuota
> | null>(null);
const ExhaustedContext = createContext(false);

/** One read-only clock for the shell; only the countdown rerenders each second. */
export function PlaytimeStatusProvider({ children }: { children: ReactNode }) {
  const quota = useExperienceQuota();
  return (
    <StatusContext.Provider value={quota}>
      <ExhaustedContext.Provider value={quota.remaining === 0}>
        {children}
      </ExhaustedContext.Provider>
    </StatusContext.Provider>
  );
}
export function usePlaytimeExhausted() {
  return useContext(ExhaustedContext);
}
export function SidebarPlaytime({ compact = false }: { compact?: boolean }) {
  const quota = useContext(StatusContext);
  return quota ? <PlaytimeSidebar quota={quota} compact={compact} /> : null;
}

/** Direct links and browser Back cannot keep a spent player mounted. Chat,
 * home, settings, and admin remain available throughout the quota pause. */
export function PlaytimeRouteGate({ children }: { children: ReactNode }) {
  const exhausted = usePlaytimeExhausted();
  const pathname = usePathname();
  const router = useRouter();
  const blocked = exhausted && isPlaytimeRoute(pathname);
  useEffect(() => {
    if (blocked) router.replace("/chat");
  }, [blocked, router]);
  return blocked ? null : children;
}

export function PlaytimeNavLink({
  disabled,
  children,
  ...props
}: ComponentProps<typeof Link> & { disabled: boolean }) {
  if (disabled)
    return (
      <span
        role="link"
        aria-disabled="true"
        className={props.className}
        title="Playtime is used up. Send a new chat message for 2 more minutes."
      >
        {children}
      </span>
    );
  return <Link {...props}>{children}</Link>;
}
