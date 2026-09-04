"use client";

import { useRef, type PointerEvent } from "react";
import { ChatBubbleLeftEllipsisIcon, CheckIcon } from "@heroicons/react/24/solid";
import styles from "./landing.module.css";

export function FeatureAnimation({ kind }: { kind: "explore" | "connect" | "habit" }) {
  const angle = useRef(0);

  function followPointer(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = event.currentTarget;
    const needle = host.querySelector<HTMLElement>(`.${styles.compassNeedle}`);
    if (!host.dataset.tracking && needle) {
      // Capture the live idle pose before handing its transform to the cursor.
      const pose = getComputedStyle(needle).transform;
      const matrix = new DOMMatrixReadOnly(pose);
      angle.current = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
      needle.style.animation = "none";
      needle.style.transform = pose;
      needle.getBoundingClientRect();
    }
    const bounds = host.getBoundingClientRect();
    const x = (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2);
    const y = (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2);
    host.dataset.tracking = "true";
    host.style.setProperty("--cursor-x", `${x * 18}px`);
    host.style.setProperty("--cursor-y", `${y * 14}px`);
    host.style.setProperty("--cursor-tilt", `${x * 9}deg`);

    const face = host.querySelector<HTMLElement>(`.${styles.compassFace}`);
    if (face) {
      const rect = face.getBoundingClientRect();
      const dx = event.clientX - rect.left - rect.width / 2;
      const dy = event.clientY - rect.top - rect.height / 2;
      if (Math.hypot(dx, dy) < 8) return;
      const target = Math.atan2(dy, dx) * 180 / Math.PI + 90 + 18;
      // Keep crossing north from causing a full revolution.
      angle.current += ((target - angle.current + 540) % 360 + 360) % 360 - 180;
      host.style.setProperty("--needle-angle", `${angle.current}deg`);
      needle?.style.removeProperty("transform");
    }
  }

  function releasePointer(event: PointerEvent<HTMLDivElement>) {
    const host = event.currentTarget;
    delete host.dataset.tracking;
    host.querySelector<HTMLElement>(`.${styles.compassNeedle}`)?.style.removeProperty("animation");
    host.style.setProperty("--cursor-x", "0px");
    host.style.setProperty("--cursor-y", "0px");
    host.style.setProperty("--cursor-tilt", "0deg");
  }

  return (
    <div
      className={`${styles.featureVisual} ${styles[kind]}`}
      aria-hidden="true"
      onPointerMove={followPointer}
      onPointerLeave={releasePointer}
      onPointerCancel={releasePointer}
    >
      <div className={styles.objectShadow} />
      <div className={styles.floatingObject}>
        {kind === "explore" ? (
          <div className={styles.compass}>
            <div className={styles.compassFace}>
              <span className={styles.compassNorth}>N</span>
              <div className={styles.compassNeedle} />
              <div className={styles.compassPin} />
            </div>
          </div>
        ) : kind === "connect" ? (
          <div className={styles.conversation}>
            <div className={styles.bubble}><ChatBubbleLeftEllipsisIcon /></div>
            <div className={styles.bubble}><ChatBubbleLeftEllipsisIcon /></div>
          </div>
        ) : (
          <div className={styles.habitStack}>
            {[0, 1, 2].map((day) => (
              <div className={styles.dayTile} key={day}>
                <span className={styles.calendarRings} />
                <CheckIcon />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
