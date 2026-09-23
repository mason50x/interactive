"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

const ActivityContext = createContext({
  active: false,
  register: () => () => {},
});

export function PlaytimeActivityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const sessions = useRef(0);
  const [active, setActive] = useState(false);
  const change = useCallback((next: boolean) => {
    if (
      typeof document.startViewTransition === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const transition = document.startViewTransition(() =>
        flushSync(() => setActive(next)),
      );
      // A quick route change can supersede the previous transition.
      void transition.ready.catch(() => {});
      void transition.finished.catch(() => {});
    } else {
      setActive(next);
    }
  }, []);
  const register = useCallback(() => {
    sessions.current += 1;
    if (sessions.current === 1) change(true);
    return () => {
      sessions.current -= 1;
      if (sessions.current === 0) change(false);
    };
  }, [change]);
  return (
    <ActivityContext.Provider value={{ active, register }}>
      {children}
    </ActivityContext.Provider>
  );
}

export function usePlaytimeActivity() {
  return useContext(ActivityContext).active;
}

export function useReportPlaytimeActivity(active: boolean) {
  const { register } = useContext(ActivityContext);
  useEffect(() => {
    if (active) return register();
  }, [active, register]);
}
