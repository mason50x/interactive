"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";

const words = ["Learning", "Planning", "Organizing"];

export function RotatingWord() {
  const container = useRef<HTMLSpanElement>(null);
  const labels = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let current = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let swap: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const label = labels.current[current];
      if (container.current && label) {
        container.current.style.width = `${label.getBoundingClientRect().width}px`;
      }
    };
    const cycle = () => {
      timer = setTimeout(() => {
        setActive(-1);
        swap = setTimeout(() => {
          current = (current + 1) % words.length;
          measure();
          setActive(current);
          cycle();
        }, 240);
      }, 5000);
    };
    const start = () => {
      clearTimeout(timer);
      clearTimeout(swap);
      setActive(current);
      if (!motion.matches) cycle();
    };
    const observer = new ResizeObserver(measure);
    labels.current.forEach((label) => label && observer.observe(label));
    measure();
    if (!motion.matches) cycle();
    motion.addEventListener("change", start);
    return () => {
      clearTimeout(timer);
      clearTimeout(swap);
      observer.disconnect();
      motion.removeEventListener("change", start);
    };
  }, []);

  return (
    <span ref={container} className={styles.rotatingWord} aria-hidden="true">
      {words.map((word, index) => (
        <b
          key={word}
          ref={(element) => { labels.current[index] = element; }}
          className={styles.rotatingLabel}
          data-active={index === active}
        >
          {word}.
        </b>
      ))}
    </span>
  );
}
