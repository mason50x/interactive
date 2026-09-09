"use client";

import { useEffect, useRef, useState } from "react";
import { RailConstellation } from "@/components/app/rail-constellation";
import styles from "./browser-check.module.css";

const STORAGE_KEY = "50x:browser-check:v1";
const LETTER =
  "M14 6H34Q38 6 38 10Q38 14 34 14H32Q29 14 29 17V47Q29 50 32 50H34Q38 50 38 54Q38 58 34 58H14Q10 58 10 54Q10 50 14 50H16Q19 50 19 47V17Q19 14 16 14H14Q10 14 10 10Q10 6 14 6Z";
/**
 * The water: a sheet whose top edge is a run of waves, three times the width
 * of the drawing so it can slide sideways without running out, and deep
 * enough to stay under the whole letter once it has risen past the top.
 */
const WATER = "M-48 0 q4 -3.2 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 V120 H-48 Z";
let lastShownInMemory = "";

function localDay() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** Daily presentation only; authentication and security remain server-enforced. */
export function BrowserCheck() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // The constellation is mounted only while the dialog is showing: a closed
  // dialog has no size for it to measure, and its burst should start with
  // the page, not with the layout.
  const [open, setOpen] = useState(false);
  // Set as the fade begins: the constellation behind the page is told to fly
  // apart at the same moment, so it leaves as particles rather than a picture.
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Defer to keep React Strict Mode's setup/cleanup replay from recording
    // a check that never appeared.
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const leave = () => {
      dialog.classList.add(styles.leaving);
      setLeaving(true);
    };
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.pseudoElement) return;
      // The letter's fill ends at the top of the I; start fading at that instant.
      if (event.target instanceof Element && event.target.classList.contains(styles.fill)) leave();
      else if (event.target === dialog) {
        dialog.close();
        setOpen(false);
      }
    };
    dialog.addEventListener("animationend", onAnimationEnd);
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
      setLeaving(false);
      setOpen(true);
      lastShownInMemory = today;
      try {
        localStorage.setItem(STORAGE_KEY, today);
      } catch {
        // The in-memory marker still covers navigation in this session.
      }
      // Reduced motion shows the letter statically, so no trace animation ends.
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) finishTimer = setTimeout(leave, 6_000);
    }, 0);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(finishTimer);
      dialog.removeEventListener("animationend", onAnimationEnd);
      dialog.close();
      setOpen(false);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="browser-check-title"
      aria-describedby="browser-check-description"
      onCancel={(event) => event.preventDefault()}
      // `isolate` is for `RailConstellation`, which draws at `-z-10`: without
      // a stacking context here that layer would fall behind `bg-background`.
      // The canvas is a child of the dialog because it listens for the
      // pointer on its own parent, and the dialog is what covers the page.
      className="fixed inset-0 isolate m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-background p-6 text-foreground outline-none backdrop:bg-background open:flex open:items-center open:justify-center"
    >
      {/* The rail's field at the rail's own weight, faded out towards the
          edges of the page, and blown apart as the page goes. */}
      {open && <RailConstellation vignette scatter={leaving} />}
      {/* Two halves: the letter on the left, the words on the right; one
          column on a phone. The words carry the same `backdrop-blur` the
          rail's labels do, so the web is out of focus exactly where they are
          and nowhere else — and only the words, because a backdrop filter is
          re-read on every frame the canvas under it changes, and it changes
          on all of them. */}
      <div
        className={`${styles.content} flex w-full max-w-6xl flex-col items-center gap-10 md:flex-row md:gap-16`}
        role="status"
      >
        {/* Sized by the viewport's height, so the letter is the page's
            subject on a desktop and still leaves room for the words on a
            phone. The stroke is in drawing units and scales with it; it is
            thinner here than the rail's marks so that at this size it stays
            a line rather than becoming a bar. */}
        <div className="flex w-full justify-center text-foreground md:w-1/2" aria-hidden="true">
          <svg className="h-[clamp(12rem,36vh,20rem)] w-auto md:h-[clamp(16rem,60vh,32rem)]" viewBox="0 0 48 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {/* The letter is traced, then filled with water: a wide wavy
                sheet, clipped to the outline, that rises through it from the
                bottom while its crests slide sideways. */}
            <clipPath id="browser-check-letter">
              <path d={LETTER} />
            </clipPath>
            <g clipPath="url(#browser-check-letter)">
              <g className={styles.fill}>
                <path className={styles.water} d={WATER} />
              </g>
            </g>
            <path className={styles.trace} pathLength="100" d={LETTER} />
          </svg>
        </div>
        <div className="flex w-full flex-col items-center text-center md:w-1/2 md:items-start md:text-left">
          {/* One line each. The sizes track the viewport so neither line
              has to break on a phone. */}
          <div className="rounded-3xl px-4 py-4 backdrop-blur-[3px] sm:px-6">
            <h1 id="browser-check-title" className="text-[clamp(1.5rem,4.5vw,3rem)] leading-tight font-semibold whitespace-nowrap">
              Checking Security
            </h1>
            <p id="browser-check-description" className="mt-3 text-[clamp(0.6875rem,2.8vw,1.125rem)] leading-relaxed whitespace-nowrap text-muted-foreground">
              We’re verifying your device for the day.
            </p>
          </div>
        </div>
      </div>
    </dialog>
  );
}
