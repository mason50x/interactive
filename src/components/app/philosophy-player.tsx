"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SpeakerWaveIcon, SpeakerXMarkIcon } from "@heroicons/react/24/outline";
import { useStillness } from "@/lib/motion";
import {
  PHILOSOPHY_LOOP_SECONDS,
  philosophyFramePose,
} from "@/lib/philosophy-timing";
import styles from "@/components/app/philosophy-animation.module.css";

type AudioEngine = {
  context: AudioContext;
  master: GainNode;
  startedAt: number;
  ready: boolean;
};

export function PhilosophyPlayer({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const engine = useRef<AudioEngine | null>(null);
  const muted = useRef(true);
  const [audible, setAudible] = useState(false);
  const [failed, setFailed] = useState(false);
  const still = useStillness();

  useEffect(() => {
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    const audio: AudioEngine = { context, master, startedAt: 0, ready: false };
    engine.current = audio;
    const abort = new AbortController();
    let disposed = false;
    let hiddenPause = false;

    const update = () =>
      setAudible(context.state === "running" && audio.ready && !muted.current);
    context.addEventListener("statechange", update);

    async function load() {
      try {
        const buffers = await Promise.all(
          ["background", "accents"].map(async (name) => {
            const response = await fetch(`/audio/philosophy/${name}-loop.wav`, {
              signal: abort.signal,
            });
            if (!response.ok) throw new Error(`Unable to load ${name}`);
            return context.decodeAudioData(await response.arrayBuffer());
          }),
        );
        if (disposed) return;
        audio.startedAt = context.currentTime + 0.05;
        buffers.forEach((buffer, index) => {
          const source = context.createBufferSource();
          const gain = context.createGain();
          source.buffer = buffer;
          source.loop = true;
          // PCM loops have exact sample boundaries, without encoder padding.
          source.loopEnd = index === 1 ? PHILOSOPHY_LOOP_SECONDS : 3.28;
          gain.gain.value = index === 0 ? 0.18 : 0.85;
          source.connect(gain).connect(master);
          // The bed is rotated to put its downbeat under the first accent.
          source.start(audio.startedAt, index === 0 ? 2.525 : 0);
        });
        audio.ready = true;
        update();
        // Stay silent until the reader explicitly enables sound.
      } catch {
        if (!disposed) setFailed(true);
      }
    }
    void load();

    const visibility = () => {
      if (document.hidden && context.state === "running") {
        hiddenPause = true;
        void context.suspend();
      } else if (!document.hidden && hiddenPause) {
        hiddenPause = false;
        void context.resume().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      abort.abort();
      engine.current = null;
      document.removeEventListener("visibilitychange", visibility);
      context.removeEventListener("statechange", update);
      void context.close();
    };
  }, []);

  useEffect(() => {
    const frames = Array.from(
      root.current?.querySelectorAll<HTMLElement>("[data-philosophy-frame]") ??
        [],
    );
    if (still) {
      frames.forEach((frame) => frame.removeAttribute("style"));
      return;
    }
    const silentStart = performance.now();
    let request = 0;
    let previous = 0;
    const painted = frames.map(() => "");
    const draw = (now: number) => {
      if (document.hidden || now - previous < 1000 / 60 - 1) {
        request = requestAnimationFrame(draw);
        return;
      }
      previous = now;
      const audio = engine.current;
      const seconds =
        audio?.ready && audio.context.state === "running"
          ? Math.max(0, audio.context.currentTime - audio.startedAt)
          : (performance.now() - silentStart) / 1000;
      frames.forEach((frame, index) => {
        const pose = philosophyFramePose(seconds, index);
        const key = `${pose.opacity.toFixed(3)},${pose.x.toFixed(2)}`;
        if (painted[index] === key) return;
        painted[index] = key;
        frame.style.opacity = String(pose.opacity);
        frame.style.filter = `blur(${pose.blur}px)`;
        frame.style.transform = `translateX(${pose.x}px) scaleX(${pose.stretch})`;
      });
      request = requestAnimationFrame(draw);
    };
    request = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(request);
  }, [still]);

  async function toggleSound() {
    const audio = engine.current;
    if (!audio || failed) return;
    if (audible) {
      muted.current = true;
      audio.master.gain.setTargetAtTime(0, audio.context.currentTime, 0.025);
      setAudible(false);
    } else {
      muted.current = false;
      audio.master.gain.setTargetAtTime(0.65, audio.context.currentTime, 0.025);
      try {
        await audio.context.resume();
        setAudible(audio.ready);
      } catch {
        setFailed(true);
      }
    }
  }

  const label = failed
    ? "Audio unavailable"
    : audible
      ? "Mute sound"
      : "Play with sound";
  return (
    <section ref={root} className={styles.page} aria-label="Our Philosophy">
      {children}
      <button
        type="button"
        className={styles.sound}
        onClick={toggleSound}
        aria-label={label}
        title={label}
        aria-pressed={audible}
        data-audible={audible}
        disabled={failed}
      >
        {audible ? (
          <SpeakerWaveIcon aria-hidden="true" />
        ) : (
          <SpeakerXMarkIcon aria-hidden="true" />
        )}
        <span>
          {failed
            ? "Audio unavailable"
            : audible
              ? "Sound on"
              : "Play with sound"}
        </span>
      </button>
      {failed ? (
        <span className="sr-only" role="status">
          Audio could not load. The animation is still available.
        </span>
      ) : null}
    </section>
  );
}
