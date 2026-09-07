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
 * What the chip in the rail should be drawing right now.
 *
 * `display` overrides the subscription for the length of the ceremony and is
 * `null` the rest of the time, which is the chip's cue to go back to reading
 * the account's own number.
 */
export type StreakDisplay = {
  display: number | null;
  glowing: boolean;
};

const StreakDisplayContext = createContext<StreakDisplay>({
  display: null,
  glowing: false,
});

export function useStreakDisplay() {
  return use(StreakDisplayContext);
}

/** Claims one weekday visit and briefly lights the updated badge. */
export function StreakProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();

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

  const [display, setDisplay] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const celebrate = useCallback((to: number) => {
    if (timer.current) clearTimeout(timer.current);
    setDisplay(to);
    timer.current = setTimeout(() => setDisplay(null), 900);
  }, []);

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
        if (result.extended) celebrate(result.current);
      });
    };

    claim(0);

    // Only the pending timer. Deliberately no `cancelled` flag around the
    // response: this effect is torn down and re-run on every mount in
    // StrictMode, and a flag would have the second pass skip the claim (the
    // ref has already been taken) while the first pass throws its answer away
    // — which is a celebration that never appears in development and does in
    // production. A `celebrate` that lands after a real unmount is a no-op,
    // which is the cheaper of the two failures by a distance.
    return () => clearTimeout(retry);
  }, [isAuthenticated, claimToday, tzOffsetMinutes, celebrate]);

  return (
    <StreakContext value={streak ?? null}>
      <StreakDisplayContext value={{ display, glowing: display !== null }}>
        {children}
      </StreakDisplayContext>
    </StreakContext>
  );
}
