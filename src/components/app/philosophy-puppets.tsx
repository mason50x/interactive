"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useStillness } from "@/lib/motion";
import styles from "./philosophy-animation.module.css";

const FINGERS = [[50, 548], [210, 591], [350, 634], [523, 526], [656, 451], [885, 549], [1046, 702], [1240, 724], [1345, 680], [1453, 642]];
const LENGTHS = FINGERS.map((_, i) => Number((83 + i % 5 * 11 + Math.sin(i * 4) * 13).toFixed(4)));
const LOOP_MS = 12000;
const SAMPLES = 240;

export function PhilosophyPuppets() {
  const frame = useRef<HTMLDivElement>(null);
  const still = useStillness();

  useEffect(() => {
    const root = frame.current;
    if (!root || still) return;
    // These transforms are sampled once, then interpolated by the compositor
    // at the display refresh rate. No canvas redraw, video decode, or JS tick.
    const animations: Animation[] = [];
    root.querySelectorAll<HTMLElement>("[data-hand]").forEach((hand, side) => {
      animations.push(hand.animate(Array.from({ length: SAMPLES + 1 }, (_, sample) => ({
        transform: `translate3d(0, ${Math.sin(sample / SAMPLES * Math.PI * 2 + side * 1.7) * 11}%, 0)`,
      })), { duration: LOOP_MS, iterations: Infinity }));
    });
    root.querySelectorAll<HTMLElement>("[data-pendulum]").forEach((pendulum, i) => {
      const frequency = 3 * 2 * Math.PI / 12;
      const stiffness = 700 / LENGTHS[i];
      const damping = 0.65;
      const lag = Math.atan2(damping * frequency, stiffness - frequency * frequency);
      const amplitude = Math.min(0.23, 0.85 / Math.hypot(stiffness - frequency * frequency, damping * frequency));
      animations.push(pendulum.animate(Array.from({ length: SAMPLES + 1 }, (_, sample) => {
        const phase = sample / SAMPLES * Math.PI * 2;
        const angle = amplitude * Math.sin(phase * 3 + i * 2.7 - lag) + 0.035 * Math.sin(phase * 2 + i);
        return { transform: `rotate(${angle}rad)` };
      }), { duration: LOOP_MS, iterations: Infinity }));
    });
    // All twelve animations share a timeline origin, including after tab hide.
    const start = document.timeline.currentTime;
    animations.forEach(animation => { animation.startTime = start; });
    const visibility = () => animations.forEach(animation => document.hidden ? animation.pause() : animation.play());
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      animations.forEach(animation => animation.cancel());
    };
  }, [still]);

  return (
    <div ref={frame} className={styles.puppets} role="img" aria-label="Two hands gently bobbing, with ten realistic phones swinging from strings attached to their fingers.">
      {[0, 1].map(side => (
        <div key={side} className={styles.hand} data-hand={side} aria-hidden="true">
          {FINGERS.slice(side * 5, side * 5 + 5).map(([x, y], finger) => {
            const index = side * 5 + finger;
            return (
              <div key={index} className={styles.pendulum} data-pendulum={index} style={{
                left: `${((x - side * 768) / 768 * 100).toFixed(4)}%`,
                top: `${(y / 1024 * 100).toFixed(4)}%`,
                "--string-length": LENGTHS[index],
              } as CSSProperties}>
                <span className={styles.string} />
                <span className={styles.puppetPhone} />
              </div>
            );
          })}
          <span className={styles.handImage} />
        </div>
      ))}
    </div>
  );
}
