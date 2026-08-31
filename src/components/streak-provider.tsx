"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StreakCelebration } from "@/components/app/streak-celebration";
import { useWelcomePlaying } from "@/components/welcome-provider";
import { api } from "../../convex/_generated/api";

export type Streak = {
  current: number;
  best: number;
  countedToday: boolean;
};

/** `null` is "not known yet", which is not the same as a streak of zero. */
const StreakContext = createContext<Streak | null>(null);

export function useStreak() {
  return use(StreakContext);
}

/**
 * Claims today for the signed-in account, and holds the answer for whatever
 * wants to draw it.
 *
 * Mounted in the dashboard layout rather than in `AppProviders`, which also
 * wraps the marketing site and the auth pages. Turning up to read the pricing
 * page is not a day's activity, and a streak claimed from `/auth` would be
 * claimed by a session that is halfway through being created.
 *
 * The claim is a single mutation on mount. Everything after that is the
 * subscription: the badge is reading `api.streaks.mine`, so it lights up when
 * the write lands, and it would light up just the same if the day had been
 * claimed in another tab.
 *
 * The celebration is deliberately not derived from the streak number going up.
 * A number changing under a subscription happens on every tab, on a reconnect,
 * and on a remount — the server instead says `extended` exactly once, on the
 * one call that moved it, and that is what opens the overlay.
 */
export function StreakProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();

  // A first ever sign-in claims its first day, so `extended` and the welcome
  // unlock land on the same tick — two overlays, one on top of the other,
  // neither readable. The claim still happens on time and the number is still
  // right; only the celebration waits, and it waits by not being mounted,
  // which is what lets it start its own timers from the moment it appears
  // rather than from the moment it was owed.
  const welcoming = useWelcomePlaying();

  // Read once and kept. This is a query argument, so a fresh value every
  // render would mean a fresh subscription every render. A tab left open
  // across a timezone change keeps the offset it started with, which is the
  // right trade for not tearing down a subscription to find out.
  const [tzOffsetMinutes] = useState(() => new Date().getTimezoneOffset());

  const streak = useQuery(
    api.streaks.mine,
    isAuthenticated ? { tzOffsetMinutes } : "skip",
  );
  const claimToday = useMutation(api.streaks.claimToday);

  /** The number to celebrate, or `null` for no celebration in flight. */
  const [celebrating, setCelebrating] = useState<number | null>(null);
  const claimed = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || claimed.current) return;
    claimed.current = true;

    let retry: ReturnType<typeof setTimeout> | undefined;

    // `StoreUser` writes the row this counts against, and on a first ever
    // sign-in the two mount together — so this can arrive at a user that does
    // not exist yet. The server says so rather than inventing a row, and the
    // fix is to ask again in a moment. Three tries and then leave it: the next
    // page load claims the day, and a day claimed a navigation late is not
    // worth a poll that never stops.
    const claim = (attempt: number) => {
      void claimToday({ tzOffsetMinutes }).then((result) => {
        if (result.deferred) {
          if (attempt < 2) {
            retry = setTimeout(() => claim(attempt + 1), 800 * (attempt + 1));
          }
          return;
        }
        if (result.extended) setCelebrating(result.current);
      });
    };

    claim(0);

    // Only the pending timer. Deliberately no `cancelled` flag around the
    // response: this effect is torn down and re-run on every mount in
    // StrictMode, and a flag would have the second pass skip the claim (the
    // ref has already been taken) while the first pass throws its answer away
    // — which is a celebration that never appears in development and does in
    // production. A `setCelebrating` that lands after a real unmount is a
    // no-op, which is the cheaper of the two failures by a distance.
    return () => clearTimeout(retry);
  }, [isAuthenticated, claimToday, tzOffsetMinutes]);

  const dismiss = useCallback(() => setCelebrating(null), []);

  return (
    <StreakContext value={streak ?? null}>
      {children}
      {/* Mounted only for the few seconds it is on screen, so it starts each
          celebration from a clean slate rather than from the end of the last
          one's exit. */}
      {celebrating !== null && !welcoming && (
        <StreakCelebration
          streak={celebrating}
          best={streak?.best ?? celebrating}
          onDismiss={dismiss}
        />
      )}
    </StreakContext>
  );
}
