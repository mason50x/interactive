"use client";

import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "@heroicons/react/24/solid";
import Image from "next/image";
import type { createDeskScene } from "./desk-scene";
import styles from "./landing.module.css";

type Scene = ReturnType<typeof createDeskScene>;

export function LearningScene() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    function updatePreference() {
      setPaused(preference.matches);
      scene.current?.setPaused(preference.matches);
    }
    preference.addEventListener("change", updatePreference);
    // Three.js stays out of the landing page's initial JavaScript chunk.
    import("./desk-scene")
      .then(({ createDeskScene }) => {
        if (cancelled || !host.current) return;
        try {
          scene.current = createDeskScene(host.current, () => setReady(true));
          updatePreference();
        } catch {
          // The static scene remains visible when WebGL is unavailable.
          host.current.replaceChildren();
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      preference.removeEventListener("change", updatePreference);
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  return (
    <div className={styles.scene}>
      <div
        className={styles.sceneViewport}
        role="img"
        aria-label="A yellow pencil writes on a stack of paper. Each finished page curls and slides off a blue desk."
      >
        {failed && <Image
          src="/images/learning-desk-white.webp"
          alt=""
          fill
          sizes="(max-width: 760px) 100vw, 50vw"
          className={styles.scenePoster}
        />}
        <div
          ref={host}
          className={styles.sceneViewport}
          data-ready={ready}
          aria-hidden="true"
        />
      </div>
      {ready && (
        <button
          type="button"
          className={styles.sceneControl}
          aria-label={paused ? "Play animation" : "Pause animation"}
          onClick={() => {
            const next = !paused;
            setPaused(next);
            scene.current?.setPaused(next);
          }}
        >
          {paused ? (
            <PlayIcon aria-hidden="true" />
          ) : (
            <PauseIcon aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
