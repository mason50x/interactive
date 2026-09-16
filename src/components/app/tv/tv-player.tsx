"use client";
import { useState } from "react";
import { ActivityFrame } from "@/components/app/activity-frame";
import type { TvShow } from "@/lib/tv-types";

export function TvPlayer({ show }: { show: TvShow }) {
  const [index, setIndex] = useState(0);
  const episode = show.episodes[index];
  return (
    <ActivityFrame
      variant="tv"
      title={`${show.displayName ?? show.title} · S${episode.season} E${episode.number}`}
      src={`https://drive.google.com/file/d/${episode.fileId}/preview`}
      controls={
        <>
          <select
            aria-label="Choose episode"
            value={index}
            onChange={(event) => setIndex(Number(event.target.value))}
            className="h-9 max-w-32 rounded-full border border-white/20 bg-black/70 px-2 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:max-w-40"
          >
            {show.episodes.map((item, i) => (
              <option key={item.fileId} value={i}>
                S{item.season} · {item.displayName ?? `Episode ${item.number}`}
              </option>
            ))}
          </select>
        </>
      }
    />
  );
}
