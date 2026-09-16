"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A row of figures with what each one counts under it.
 *
 * A `dl`, because a figure and its label are a term and its description, and
 * a screen reader pairs them that way. Two sizes: `large` is the stats band
 * on the landing page, where each figure is ruled off on the left and the
 * label is given room to run to two lines; `default` is the compact row of
 * facts under the about page's intro.
 */
export function StatList({
  items,
  size = "default",
  className,
  animate = false,
}: {
  items: readonly { value: string; label: string }[];
  size?: "default" | "large";
  className?: string;
  animate?: boolean;
}) {
  const large = size === "large";
  const listRef = useRef<HTMLDListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!animate || !list || !("IntersectionObserver" in window)) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations: Animation[] = [];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          if (motion.matches) return;
          animations.push(
            entry.target.animate(
              [
                { opacity: 0.35, transform: "translateY(10px)" },
                { opacity: 1, transform: "translateY(0)" },
              ],
              { duration: 550, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            ),
          );
        });
      },
      { threshold: 0.6 },
    );
    Array.from(list.children).forEach((item) => observer.observe(item));
    const stopMotion = () => {
      if (motion.matches) animations.forEach((animation) => animation.cancel());
    };
    motion.addEventListener("change", stopMotion);
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
      motion.removeEventListener("change", stopMotion);
    };
  }, [animate]);

  return (
    <dl
      ref={listRef}
      className={cn(
        "grid grid-cols-2 gap-x-6 lg:grid-cols-4",
        large ? "gap-y-10" : "gap-y-8",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex flex-col",
            large ? "gap-2 border-l border-border pl-5" : "gap-1.5",
          )}
        >
          <dt
            className={cn(
              "text-display text-foreground",
              large
                ? "text-[2.5rem] sm:text-[3rem]"
                : "text-[2.25rem] sm:text-[2.75rem]",
            )}
          >
            {item.value}
          </dt>
          <dd
            className={cn(
              "text-[0.9375rem] text-muted-foreground",
              large && "max-w-[14rem] leading-relaxed",
            )}
          >
            {item.label}
          </dd>
        </div>
      ))}
    </dl>
  );
}
