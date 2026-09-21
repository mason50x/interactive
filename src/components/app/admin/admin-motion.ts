import { useEffect, useRef } from "react";

/** One-shot reveals scoped to the app's independent scroll surface. */
export function useAdminReveals(enabled = true) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    const scroller = root.closest("main");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Map<HTMLElement, Animation>();
    const elements = [
      ...root.querySelectorAll<HTMLElement>("[data-admin-reveal]"),
    ];
    const finish = (element: HTMLElement) => {
      element.dataset.revealPlayed = "true";
      animations.get(element)?.cancel();
      animations.delete(element);
    };
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const element = entry.target as HTMLElement;
              observer?.unobserve(element);
                element.dataset.revealPlayed = "true";
                if (
                  reduced.matches ||
                  document.hidden ||
                  entry.boundingClientRect.bottom <= 0
                )
                  finish(element);
                else animations.get(element)?.play();
              }
            },
            { root: scroller, threshold: 0, rootMargin: "0px 0px 120px 0px" },
          )
        : undefined;
    const bottom = () =>
      scroller?.getBoundingClientRect().bottom ?? innerHeight;
    for (const element of elements) {
      if (element.dataset.revealPlayed === "true") continue;
      if (
        reduced.matches ||
        !observer ||
        !element.animate ||
        document.hidden ||
        element.getBoundingClientRect().top < bottom()
      ) {
        finish(element);
        continue;
      }
      const rise = element.dataset.adminReveal === "rise";
      const animation = element.animate(
        [
          { opacity: 0, ...(rise ? { transform: "translateY(10px)" } : {}) },
          { opacity: 1, ...(rise ? { transform: "none" } : {}) },
        ],
        {
          duration: rise ? 520 : 600,
          delay: Number(element.dataset.delay ?? 0),
          easing: "cubic-bezier(0.22,1,0.36,1)",
          fill: "backwards",
        },
      );
      animation.pause();
      animation.onfinish = () => finish(element);
      animations.set(element, animation);
      observer.observe(element);
    }
    const stop = () => {
      observer?.disconnect();
      elements.forEach(finish);
    };
    let last = scroller?.scrollTop ?? window.scrollY;
    const onScroll = () => {
      const next = scroller?.scrollTop ?? window.scrollY;
      if (Math.abs(next - last) > (scroller?.clientHeight ?? innerHeight) / 2) {
        for (const element of elements) {
          if (element.getBoundingClientRect().top < bottom()) {
            observer?.unobserve(element);
            finish(element);
          }
        }
      }
      last = next;
    };
    const onPreference = () => {
      if (reduced.matches) stop();
    };
    const scrollTarget = scroller ?? window;
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", stop);
    reduced.addEventListener("change", onPreference);
    return () => {
      stop();
      scrollTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", stop);
      reduced.removeEventListener("change", onPreference);
    };
  }, [enabled]);
  return ref;
}

export function useAdminEntrance() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = ref.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    if (!root || reduced.matches || (root.closest("main")?.scrollTop ?? 0) > 8)
      return;
    const animations = [...root.querySelectorAll("h1, [data-intro]")].map(
      (element, index) =>
        element.animate(
          [{ transform: "translateY(8px)" }, { transform: "none" }],
          {
            duration: 500,
            delay: index * 70,
            easing: "cubic-bezier(0.22,1,0.36,1)",
            fill: "backwards",
          },
        ),
    );
    const stop = () => animations.forEach((animation) => animation.cancel());
    reduced.addEventListener("change", stop);
    return () => {
      stop();
      reduced.removeEventListener("change", stop);
    };
  }, []);
  return ref;
}
