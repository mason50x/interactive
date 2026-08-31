"use client";

import { useSession } from "@clerk/nextjs";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { WelcomeUnlock } from "@/components/app/welcome-unlock";
import {
  decideWelcome,
  endWelcome,
  isWelcomePlaying,
  subscribeToWelcome,
  welcomeNeverPlaysOnServer,
} from "@/lib/welcome";

/**
 * Is the unlock on screen right now?
 *
 * `false` also covers "Clerk has not said yet", which is what every consumer
 * wants: the question is only ever asked in order to hold something back, and
 * a welcome that turns out not to be owed would otherwise hold it forever.
 *
 * A subscription to a module-level store rather than a context read, so
 * anything can ask without being underneath anything. See `src/lib/welcome.ts`.
 */
export function useWelcomePlaying() {
  return useSyncExternalStore(
    subscribeToWelcome,
    isWelcomePlaying,
    welcomeNeverPlaysOnServer,
  );
}

/**
 * Asks the question on arrival, and renders the answer.
 *
 * The effect runs on every Clerk re-render — there is one on every token
 * refresh — but `decideWelcome` only ever answers once, which is what stops
 * the unlock restarting a minute into a session or cancelling itself the
 * moment the freshness window closes.
 */
export function WelcomeProvider({ children }: { children: ReactNode }) {
  const { isLoaded, session } = useSession();
  const playing = useWelcomePlaying();

  useEffect(() => {
    if (!isLoaded) return;
    decideWelcome(session ?? null);
  }, [isLoaded, session]);

  return (
    <>
      {children}
      {playing && <WelcomeUnlock onDismiss={endWelcome} />}
    </>
  );
}
