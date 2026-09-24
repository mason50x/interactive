"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { TimeoutMessage } from "@/components/app/timeout-message";
import { PacketCover } from "@/components/app/packet-cover";
import styles from "./timeout-gate.module.css";

function AccessLoader({ loaderRef }: { loaderRef?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={loaderRef}
      className="fixed inset-0 bg-background text-foreground"
    >
      <PacketCover label="Access" holdMs={null} />
    </div>
  );
}

function AccessReveal({
  children,
  ready,
}: {
  children: ReactNode;
  ready: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);

  if (!ready && revealed) setRevealed(false);

  useLayoutEffect(() => {
    const loader = loaderRef.current;
    const reveal = revealRef.current;
    if (revealed || !loader || !reveal) return;

    // The logo itself rather than the loader around it, so the circle opens
    // from the mark even if the cover ever stops centring it.
    const logo = loader.querySelector(".packet-logo") ?? loader;
    const alignReveal = () => {
      const logoBounds = logo.getBoundingClientRect();
      const revealBounds = reveal.getBoundingClientRect();
      // Clip coordinates are local to the reveal, not the viewport.
      reveal.style.setProperty(
        "--reveal-x",
        `${logoBounds.left + logoBounds.width / 2 - revealBounds.left}px`,
      );
      reveal.style.setProperty(
        "--reveal-y",
        `${logoBounds.top + logoBounds.height / 2 - revealBounds.top}px`,
      );
    };

    // Every frame for the length of the reveal, not on resize: the reveal can
    // move without changing size (a scroll, the viewport settling, the ChromeOS
    // shelf or toolbar), and a ResizeObserver never hears about that, which
    // left the circle opening from a stale point on Chromebooks.
    let frame = 0;
    const follow = () => {
      alignReveal();
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [ready, revealed]);

  return (
    <>
      {!revealed && <AccessLoader loaderRef={loaderRef} />}
      {ready && (
        <div
          ref={revealRef}
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
  const timeout = useAuthedQuery(api.timeouts.mine, {});
  if (timeout) return <TimeoutMessage {...timeout} />;
  // Keep the same loader mounted as the query resolves so its ring and
  // constellation continue uninterrupted through the reveal.
  return <AccessReveal ready={timeout !== undefined}>{children}</AccessReveal>;
}
