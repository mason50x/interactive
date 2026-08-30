"use client";

import { useEffect, useState } from "react";

/**
 * The app's side of the origin boundary.
 *
 * The frame is the only thing the app gives a game, and `postMessage` is the
 * only thing it takes back. Nothing here ever touches the frame's document:
 * that would need `contentWindow` access the browser refuses across origins,
 * which is the whole reason the games live on their own hostname.
 */
export function GameFrame({
  slug,
  title,
  src,
  playerOrigin,
}: {
  slug: string;
  title: string;
  src: string;
  /** `null` on a single-origin deployment — see `src/lib/player.ts`. */
  playerOrigin: string | null;
}) {
  const [lastScore, setLastScore] = useState<number | null>(null);

  useEffect(() => {
    // A fully sandboxed frame has an opaque origin, which arrives as the
    // string "null". That is the un-isolated fallback below; on a real player
    // origin nothing but that exact origin is accepted.
    const expected = playerOrigin ?? "null";

    function onMessage(event: MessageEvent) {
      if (event.origin !== expected) return;

      const data: unknown = event.data;
      if (typeof data !== "object" || data === null) return;

      const message = data as Record<string, unknown>;
      if (message.source !== "player" || message.slug !== slug) return;
      if (message.type !== "score" || typeof message.score !== "number") return;

      // Treated as display only. A score arriving from a frame the player
      // controls is a claim; anything that ends up in Convex — a leaderboard,
      // a streak — has to be written by code they cannot reach.
      setLastScore(message.score);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [slug, playerOrigin]);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-[1.5rem] border border-border bg-[#111418]">
        <iframe
          src={src}
          title={title}
          // `allow-same-origin` is safe here only because the frame is already
          // cross-origin: it lets the game keep its own storage bucket for save
          // states without reaching ours. On the single-origin fallback it is
          // withheld, because same-origin plus allow-scripts is a sandbox that
          // does nothing at all.
          sandbox={
            playerOrigin ? "allow-scripts allow-same-origin" : "allow-scripts"
          }
          allow="gamepad; fullscreen"
          referrerPolicy="no-referrer"
          className="block h-[min(78vh,38rem)] w-full border-0"
        />
      </div>

      <p
        className="label-small text-faint"
        aria-live="polite"
      >
        {lastScore === null
          ? "Scores from this run appear here."
          : `Last run: ${lastScore}`}
      </p>
    </div>
  );
}
