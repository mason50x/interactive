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
const VoteHeldContext = createContext(false);

/** One read-only clock for the shell; only the countdown rerenders each second. */
export function PlaytimeStatusProvider({ children }: { children: ReactNode }) {
  const quota = useExperienceQuota();
  const voteHeld = quota.status?.voteRequired === true;
  return (
    <StatusContext.Provider value={quota}>
      <ExhaustedContext.Provider value={quota.remaining === 0 || voteHeld}>
        <VoteHeldContext.Provider value={voteHeld}>
          {children}
        </VoteHeldContext.Provider>
      </ExhaustedContext.Provider>
    </StatusContext.Provider>
  );
}
/** The shell's playtime clock, for anything that wants to show it. */
export function usePlaytimeQuota() {
  return useContext(StatusContext);
}
/** No play right now: the time is spent, or a forced vote is waiting. */
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
  const quota = usePlaytimeQuota();
  const remaining = quota?.remaining ?? null;
  // A vote hold reads like running out: `null` while loading, else 0 or not.
  const left = quota?.status?.voteRequired ? 0 : remaining;
  const exhausted = left === 0;
  const pathname = usePathname();
  const router = useRouter();
  const [ranOutOn, setRanOutOn] = useState<string | null>(null);
  const [had, setHad] = useState(left);
  if (had !== left) {
    setHad(left);
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
  const voteHeld = useContext(VoteHeldContext);
  if (disabled)
    return (
      <span
        role="link"
        aria-disabled="true"
        className={props.className}
        title={
          voteHeld
            ? "Vote to keep playing."
            : "Playtime is used up. Send a real chat message for more playtime."
        }
      >
        {children}
      </span>
    );
  return <Link {...props}>{children}</Link>;
}
