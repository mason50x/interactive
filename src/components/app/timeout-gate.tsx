"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { TimeoutMessage } from "@/components/app/timeout-message";
import { PacketCover } from "@/components/app/packet-cover";
import styles from "./timeout-gate.module.css";

function AccessLoader() {
  return (
    <div className="fixed inset-0 bg-background text-foreground">
      <PacketCover label="Access" holdMs={null} />
    </div>
  );
}

/**
 * Whether this document has already opened the app once. The reveal is the
 * arrival, not something to replay: anything that remounts the gate after
 * that — leaving the signed-in app and coming back, a gate further up
 * re-rendering — should land straight on the app.
 */
let arrived = false;
/** The last answer this document heard, so a remount opens on it. */
let lastTimeout: Timeout | undefined;

type Timeout = ReturnType<typeof useAuthedQuery<typeof api.timeouts.mine>>;

const noop = () => () => {};

/** Framed by the app, which has already played the reveal around it. */
function isFramed() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function AccessReveal({
  children,
  ready,
}: {
  children: ReactNode;
  ready: boolean;
}) {
  // Read once, on mount: a reveal that starts here finishes even though it
  // flips `arrived` for every mount after it.
  const [arrivedOnMount] = useState(() => arrived);
  // Snapshotted, with `false` on the server, so hydration still matches.
  const framed = useSyncExternalStore(noop, isFramed, () => false);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (ready) arrived = true;
  }, [ready]);
  const skip = arrivedOnMount || framed;

  if (skip) return ready ? children : null;

  return (
    <>
      {!revealed && <AccessLoader />}
      {ready && (
        <div
          className={revealed ? "contents" : styles.reveal}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setRevealed(true);
          }}
        >
          {children}
        </div>
      )}
    </>
  );
}

/** Unmount active frames and chat, rather than leaving them running under an overlay. */
export function TimeoutGate({ children }: { children: ReactNode }) {
  const latest = useAuthedQuery(api.timeouts.mine, {});
  // The query reads `undefined` again whenever Convex re-checks the session,
  // which it does on coming back to the tab. Hold the last answer through
  // that rather than dropping to the loader, which would unmount the whole
  // app — the game, the chat, the open experience tabs — on every return.
  const [settled, setSettled] = useState(latest ?? lastTimeout);
  if (latest !== undefined && latest !== settled) setSettled(latest);
  const timeout = latest === undefined ? settled : latest;
  useEffect(() => {
    if (timeout !== undefined) lastTimeout = timeout;
  }, [timeout]);
  if (timeout) return <TimeoutMessage {...timeout} />;
  // Keep the same loader mounted as the query resolves so its ring and
  // constellation continue uninterrupted through the reveal.
  return <AccessReveal ready={timeout !== undefined}>{children}</AccessReveal>;
}
