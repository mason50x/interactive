"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { api } from "@convex/_generated/api";
import { Monogram } from "@/components/app/chat/monogram";
import { RailConstellation } from "@/components/app/rail-constellation";
import { LogoMark } from "@/components/wordmark";
import { navItems } from "@/lib/nav";
import { onboardingEndSeconds, onboardingStageAt, onboardingVolumeAt } from "@/lib/onboarding-timing";
import styles from "./onboarding.module.css";

const scenes = [
  {
    title: "Welcome to interactive learning.",
    detail: "Your space to explore, play, and connect.",
  },
  {
    title: "You’ve never seen a website like this.",
    detail: "Everything you need lives together in one place.",
  },
  {
    title: "Activities that pull you in.",
    detail: "Jump into something new whenever curiosity strikes.",
  },
  {
    title: "TV when it’s time to take a break.",
    detail: "Find something good and settle in.",
  },
  {
    title: "Chat, browse, and make it yours.",
    detail: "Move between friends, the web, and your next discovery.",
  },
] as const;

const games = [
  ["Slope", "/thumbnails/slope.jpg"],
  ["Subway Surfers", "/thumbnails/subwaysurfers.webp"],
  ["Run 3", "/thumbnails/run3.jpg"],
  ["Minecraft", "/thumbnails/mc.webp"],
  ["Papa's Pizzaria", "/thumbnails/papaspizzaria.webp"],
  ["Super Mario 64", "/thumbnails/sm64.webp"],
] as const;
const shows = [
  ["Avatar: The Last Airbender", "/thumbnails/tv/tvmaze-555.jpg"],
  ["Gravity Falls", "/thumbnails/tv/tvmaze-396.jpg"],
  ["Adventure Time", "/thumbnails/tv/tvmaze-56904.jpg"],
  ["Teen Titans", "/thumbnails/tv/tvmaze-765.jpg"],
  ["The Amazing World of Gumball", "/thumbnails/tv/tvmaze-3134.jpg"],
] as const;

function NavOrbit() {
  return (
    <div className={styles.navVisual} aria-label="The website's destinations come together around the interactive logo">
      <div className={styles.navRow}>
        {navItems.map((item, index) => {
          const Icon = item.icon.solid;
          return (
            <div className={styles.navTile} key={item.href} style={{ "--i": index } as React.CSSProperties}>
              <Icon className={styles.navIcon} />
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>
      <div className={styles.orbitCore}><LogoMark /></div>
      <div className={styles.orbitRing} />
    </div>
  );
}

function CatalogueGrid({ kind }: { kind: "games" | "tv" }) {
  const items = kind === "games" ? games : shows;
  return (
    <div className={`${styles.catalogueGrid} ${kind === "tv" ? styles.tvGrid : ""}`} aria-label={kind === "games" ? "Activities catalogue" : "TV catalogue"}>
      {items.map(([title, thumbnail], index) => (
        <div className={styles.catalogueCard} key={title} style={{ "--i": index } as React.CSSProperties}>
          <Image src={thumbnail} alt={title} fill sizes="(max-width: 767px) 30vw, 160px" />
          <span>{title}</span>
        </div>
      ))}
    </div>
  );
}

function ChatVisual() {
  return (
    <div className={styles.chatVisual} aria-label="A preview of chat messages">
      <div className={styles.chatLine}>
        <Monogram handle="river" initials="R" className={styles.chatAvatar} />
        <div className={styles.chatContent}><span>river</span><div className={`${styles.chatBubble} bubble-theirs`}>How did you get past level 3?</div></div>
      </div>
      <div className={`${styles.chatLine} ${styles.chatOwn}`}>
        <div className={styles.chatContent}><div className={`${styles.chatBubble} bubble-mine`}>Jump right before the edge.</div></div>
      </div>
      <div className={styles.chatLine}>
        <Monogram handle="river" initials="R" className={styles.chatAvatar} />
        <div className={styles.chatContent}><div className={`${styles.chatBubble} bubble-theirs`}>Oh, that worked. Thanks.</div></div>
      </div>
    </div>
  );
}

function RestrictionsVisual() {
  return (
    <div className={styles.restrictionsVisual} aria-label="A hand pushes Securly and GoGuardian away">
      <div className={`${styles.filterCard} ${styles.filterSecurly}`}>
        <Image src="/onboarding/securly.svg" alt="Securly" width={210} height={55} />
      </div>
      <div className={`${styles.filterCard} ${styles.filterGuardian}`}>
        <Image src="/onboarding/goguardian.svg" alt="GoGuardian" width={210} height={55} />
      </div>
      <span className={styles.pushHand} aria-hidden="true">🫷</span>
    </div>
  );
}

function BinaryGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const points = Array.from({ length: 390 }, (_, index) => {
      const y = 1 - (index / 389) * 2;
      const radius = Math.sqrt(1 - y * y);
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius, digit: index % 3 === 0 ? "0" : "1" };
    });
    let frame = 0;
    let start = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const turn = reduced ? 0.35 : (now - start) * 0.00032;
      const tilt = -0.25;
      const size = Math.min(width, height) * 0.43;
      const projected = points.map((point) => {
        const x = point.x * Math.cos(turn) + point.z * Math.sin(turn);
        const z = point.z * Math.cos(turn) - point.x * Math.sin(turn);
        const y = point.y * Math.cos(tilt) - z * Math.sin(tilt);
        const depth = point.y * Math.sin(tilt) + z * Math.cos(tilt);
        return { x, y, depth, digit: point.digit };
      }).sort((a, b) => a.depth - b.depth);
      for (const point of projected) {
        const perspective = 2.8 / (2.8 - point.depth * 0.38);
        context.font = `${Math.round((9 + point.depth * 3) * perspective)}px ui-monospace, SFMono-Regular, monospace`;
        context.fillStyle = `rgba(220,234,255,${0.12 + (point.depth + 1) * 0.34})`;
        context.textAlign = "center";
        context.fillText(point.digit, width / 2 + point.x * size * perspective, height / 2 + point.y * size * perspective);
      }
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); start = 0; };
  }, []);
  return <canvas ref={canvasRef} className={styles.binaryGlobe} role="img" aria-label="A rotating globe made of zeros and ones" />;
}

export function OnboardingExperience() {
  // Opening, logo burst, five product scenes, restrictions, then entry.
  const [stage, setStage] = useState(0);
  const [started, setStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const startedAt = useRef(0);
  const complete = useMutation(api.users.completeOnboarding);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      // React clears the DOM ref during unmount, so retain the element here.
      audio?.pause();
    };
  }, []);

  useEffect(() => {
    if (!started) return;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      const elapsed = audio && !audio.paused
        ? Math.max(audio.currentTime, (performance.now() - startedAt.current) / 1000)
        : (performance.now() - startedAt.current) / 1000;
      const next = onboardingStageAt(elapsed);
      setStage((current) => Math.max(current, next));
      if (audio && !audio.paused) {
        audio.volume = onboardingVolumeAt(elapsed);
        if (elapsed >= onboardingEndSeconds) audio.pause();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started]);

  async function enter() {
    if (saving) return;
    setSaving(true);
    setError("");
    // The mutation can remove this component before its promise resolves.
    audioRef.current?.pause();
    try {
      await complete();
    } catch {
      setError("Couldn’t save your progress. Try again.");
      setSaving(false);
    }
  }

  const scene = stage >= 2 && stage <= 6 ? scenes[stage - 2] : null;

  function start() {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = 0.45;
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    }
    startedAt.current = performance.now();
    setStarted(true);
    setStage(1);
  }

  return (
    <main
      className={styles.screen}
      aria-label="Welcome to interactive learning"
    >
      <RailConstellation
        className={styles.constellation}
        areaPerPoint={8500}
        maxPoints={150}
        vignette
      />
      <audio ref={audioRef} src="/audio/onboarding.mp3" preload="auto" loop />
      {stage === 0 && (
        <section className={styles.opening}>
          <h1>You&apos;re in</h1>
          <p>You&apos;re one of the lucky few that got access to interactive</p>
          <button className={styles.primary} onClick={start}>
            Start
          </button>
        </section>
      )}

      {stage === 1 && (
        <div
          className={styles.burst}
          aria-label="Interactive logo bursts into light"
        >
          <LogoMark className={styles.burstLogo} />
          {Array.from({ length: 16 }, (_, index) => (
            <i
              key={index}
              className={styles.particle}
              style={
                {
                  "--angle": `${index * 22.5}deg`,
                  "--distance": `${110 + (index % 4) * 30}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {scene && (
        <section key={stage} className={styles.story} aria-live="polite">
          <h1>{scene.title}</h1>
          <p>{scene.detail}</p>
          {stage === 3 && <NavOrbit />}
          {stage === 4 && <CatalogueGrid kind="games" />}
          {stage === 5 && <CatalogueGrid kind="tv" />}
          {stage === 6 && <ChatVisual />}
        </section>
      )}

      {stage === 7 && (
        <section key={stage} className={styles.story} aria-live="polite">
          <h1>Goodbye restrictions.</h1>
          <RestrictionsVisual />
        </section>
      )}

      {stage === 8 && (
        <section className={styles.final} aria-live="polite">
          <BinaryGlobe />
          <h1>Your world is ready.</h1>
          <button
            className={styles.primary}
            onClick={() => void enter()}
            disabled={saving}
          >
            {saving ? "Opening…" : "I’m ready to enter"}
          </button>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
