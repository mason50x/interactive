"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from "@heroicons/react/24/solid";
import { Button, ButtonLink } from "@/components/ui/button";
import { thumbnailSrc, type ActivityEntry } from "@/lib/activity";
import styles from "./home.module.css";

export function GameCarousel({
  games,
  loading,
  recent = false,
}: {
  games: readonly ActivityEntry[];
  loading: boolean;
  recent?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const touch = useRef<number | null>(null);
  const count = games.length;
  const active = count ? index % count : 0;
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (paused || focused || reduced || count < 2) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((value) => (value + 1) % count);
    }, 3500);
    return () => clearInterval(timer);
  }, [paused, focused, reduced, count]);
  function move(direction: number) {
    setIndex((value) => (value + direction + count) % count);
  }
  if (!count)
    return (
      <div className={styles.empty} role="status">
        <p>
          {loading ? "Finding your games…" : "Your next favorite is waiting."}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {loading
            ? "Just a moment."
            : "Open a game and come back to pick up where you left off."}
        </p>
        {!loading && (
          <ButtonLink href="/activities" className="mt-5">
            Browse activities
          </ButtonLink>
        )}
      </div>
    );
  return (
    <section
      aria-label={recent ? "Recently played games" : "Suggested games"}
      aria-roledescription="carousel"
      onFocusCapture={(event) =>
        setFocused(event.target.matches(":focus-visible"))
      }
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          move(event.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <div
        className={styles.stage}
        onTouchStart={(event) => {
          touch.current = event.touches[0].clientX;
        }}
        onTouchEnd={(event) => {
          if (touch.current !== null) {
            const delta = event.changedTouches[0].clientX - touch.current;
            if (Math.abs(delta) > 45) move(delta < 0 ? 1 : -1);
            touch.current = null;
          }
        }}
      >
        {games.map((game, position) => {
          let offset = (position - active + count) % count;
          if (offset > count / 2) offset -= count;
          const visible = Math.abs(offset) <= 1;
          return (
            <article
              key={game.slug}
              className={styles.slide}
              data-center={offset === 0}
              data-side={offset < 0 ? "left" : "right"}
              aria-hidden={!visible}
              inert={!visible}
              aria-roledescription="slide"
              aria-label={`${position + 1} of ${count}: ${game.title}`}
              style={
                {
                  "--offset": Math.max(-2, Math.min(2, offset)),
                  opacity: visible ? 1 : 0,
                  zIndex: offset === 0 ? 3 : visible ? 2 : 0,
                  pointerEvents: visible ? "auto" : "none",
                } as CSSProperties
              }
            >
              {/* Existing catalogue art stays behind the authenticated provider. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailSrc(game)}
                alt=""
                loading={visible ? "eager" : "lazy"}
                draggable={false}
                className={styles.art}
              />
              <div className={styles.scrim} />
              <div className={styles.caption}>
                <h2>{game.title}</h2>
                <ButtonLink
                  href={`/activities/${game.slug}`}
                  prefetch={false}
                  className={styles.play}
                  aria-label={`Play ${game.title}`}
                >
                  <PlayIcon className="size-4" />
                  Play
                </ButtonLink>
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-center gap-1 sm:gap-3">
        <Button
          variant="outline"
          size="icon"
          shape="circle"
          aria-label="Previous game"
          disabled={count < 2}
          onClick={() => move(-1)}
        >
          <ChevronLeftIcon />
        </Button>
        <div className="flex min-w-0 items-center gap-0 sm:gap-1">
          {games.map((game, i) => (
            <button
              key={game.slug}
              type="button"
              className="flex size-3 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ring sm:size-6"
              aria-label={`Show ${game.title}`}
              aria-pressed={i === active}
              onClick={() => setIndex(i)}
            >
              <span
                className={`h-1.5 rounded-full transition-all ${i === active ? "w-3 bg-foreground sm:w-4" : "w-1.5 bg-foreground/25"}`}
              />
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="icon"
          shape="circle"
          aria-label="Next game"
          disabled={count < 2}
          onClick={() => move(1)}
        >
          <ChevronRightIcon />
        </Button>
        {!reduced && count > 1 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={paused ? "Start slideshow" : "Pause slideshow"}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </Button>
        )}
      </div>
    </section>
  );
}
