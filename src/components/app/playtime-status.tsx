"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
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
/** The shell's playtime clock, for anything that wants to show it. */
export function usePlaytimeQuota() {
  return useContext(StatusContext);
}
export function usePlaytimeExhausted() {
  return useContext(ExhaustedContext);
}
export function SidebarPlaytime({ compact = false }: { compact?: boolean }) {
  const quota = useContext(StatusContext);
  return quota ? <PlaytimeSidebar quota={quota} compact={compact} /> : null;
}

/** Direct links and browser Back cannot keep a spent player mounted. Chat,
 * home, settings, and admin remain available throughout the quota pause.
 *
 * Running out on a player page keeps you there: the player's own gate swaps
 * in the used-up screen, rather than a jump to chat that reads as lost
 * progress. Only arriving on a player route with no time left redirects. */
export function PlaytimeRouteGate({ children }: { children: ReactNode }) {
  const remaining = usePlaytimeQuota()?.remaining ?? null;
  const exhausted = remaining === 0;
  const pathname = usePathname();
  const router = useRouter();
  const [ranOutOn, setRanOutOn] = useState<string | null>(null);
  const [had, setHad] = useState(remaining);
  if (had !== remaining) {
    setHad(remaining);
    // `null` is still loading, so a first answer of zero is not running out.
    if (exhausted && had !== null && had > 0) setRanOutOn(pathname);
    if (!exhausted) setRanOutOn(null);
  }
  const blocked =
    exhausted && isPlaytimeRoute(pathname) && ranOutOn !== pathname;
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
        title="Playtime is used up. Send a real chat message for more playtime."
      >
        {children}
      </span>
    );
  return <Link {...props}>{children}</Link>;
}
