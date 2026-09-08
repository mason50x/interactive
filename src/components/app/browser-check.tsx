"use client";

import { useEffect, useRef } from "react";
import styles from "./browser-check.module.css";

const STORAGE_KEY = "50x:browser-check:v1";
let lastShownInMemory = "";

function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** Daily presentation only; authentication and security remain server-enforced. */
export function BrowserCheck() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Defer to keep React Strict Mode's setup/cleanup replay from recording
    // a check that never appeared.
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const finishFade = (event: AnimationEvent) => {
      if (event.target === dialog && !event.pseudoElement) dialog.close();
    };
    dialog.addEventListener("animationend", finishFade);
    const startTimer = setTimeout(() => {
      const today = localDay();
      let lastShown = lastShownInMemory;
      try {
        lastShown = localStorage.getItem(STORAGE_KEY) || lastShown;
      } catch {
        // Restricted storage must never prevent access to the dashboard.
      }
      if (lastShown === today) return;

      dialog.classList.remove(styles.leaving);
      dialog.showModal();
      lastShownInMemory = today;
      try {
        localStorage.setItem(STORAGE_KEY, today);
      } catch {
        // The in-memory marker still covers navigation in this session.
      }
      finishTimer = setTimeout(() => dialog.classList.add(styles.leaving), 6_000);
    }, 0);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(finishTimer);
      dialog.removeEventListener("animationend", finishFade);
      dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="browser-check-title"
      aria-describedby="browser-check-description"
      onCancel={(event) => event.preventDefault()}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-background p-6 text-foreground outline-none backdrop:bg-background open:flex open:items-center open:justify-center"
    >
      <div className="flex w-full max-w-4xl flex-col items-center text-center" role="status">
        <div className="mb-8 flex size-36 items-center justify-center text-foreground" aria-hidden="true">
          <svg width="84" height="112" viewBox="0 0 48 64" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path
              className={styles.trace}
              pathLength="100"
              d="M14 6H34Q38 6 38 10Q38 14 34 14H32Q29 14 29 17V47Q29 50 32 50H34Q38 50 38 54Q38 58 34 58H14Q10 58 10 54Q10 50 14 50H16Q19 50 19 47V17Q19 14 16 14H14Q10 14 10 10Q10 6 14 6Z"
            />
          </svg>
        </div>
        <h1 id="browser-check-title" className="whitespace-nowrap text-[clamp(0.625rem,3.7vw,1.875rem)] font-semibold tracking-tight">
          Checking your browser’s integrity and security
        </h1>
        <p id="browser-check-description" className="mt-4 whitespace-nowrap text-[clamp(0.5rem,2.5vw,1rem)] leading-relaxed text-muted-foreground">
          This should only take a couple of seconds. Please remain on this page.
        </p>
      </div>
    </dialog>
  );
}
