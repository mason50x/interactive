"use client";

import { useState, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { TimeoutMessage } from "@/components/app/timeout-message";
import { LogoMark } from "@/components/wordmark";
import styles from "./timeout-gate.module.css";

const revealShapes = ["circle", "triangle", "diamond", "square"] as const;

function chooseRevealShape(element: HTMLDivElement | null) {
  if (element) {
    element.dataset.shape =
      revealShapes[Math.floor(Math.random() * revealShapes.length)];
  }
}

function AccessLoader() {
  return (
    <div
      className="fixed inset-0 grid place-items-center bg-background text-foreground"
      role="status"
      aria-label="Checking access"
    >
      <LogoMark className={`h-12 w-auto ${styles.pulse}`} />
    </div>
  );
}

function AccessReveal({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <>
      {!revealed && <AccessLoader />}
      <div
        ref={chooseRevealShape}
        className={revealed ? "contents" : styles.reveal}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setRevealed(true);
        }}
      >
        {children}
      </div>
    </>
  );
}

/** Unmount active frames and chat, rather than leaving them running under an overlay. */
export function TimeoutGate({ children }: { children: ReactNode }) {
  const timeout = useAuthedQuery(api.timeouts.mine, {});
  if (timeout === undefined) return <AccessLoader />;
  if (timeout) return <TimeoutMessage {...timeout} />;
  return <AccessReveal>{children}</AccessReveal>;
}
