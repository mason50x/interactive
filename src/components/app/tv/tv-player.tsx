"use client";
import { useId, useState } from "react";
import { ChatBubbleBottomCenterTextIcon } from "@heroicons/react/24/outline";
import { ActivityFrame } from "@/components/app/activity-frame";
import type { TvEpisode, TvShow } from "@/lib/tv-types";

function episodeDriveUrl(show: TvShow, episode: TvEpisode) {
  // Keep any resource key on the catalogue link for the episode it names.
  if (show.sourceUrl.includes(`/d/${episode.fileId}/`)) return show.sourceUrl;
  return `https://drive.google.com/file/d/${encodeURIComponent(episode.fileId)}/view`;
}

export function TvPlayer({ show }: { show: TvShow }) {
  const [index, setIndex] = useState(0);
  const [captionsOpen, setCaptionsOpen] = useState(false);
  const captionsId = useId();
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
            onChange={(event) => {
              setIndex(Number(event.target.value));
              setCaptionsOpen(false);
            }}
            className="h-9 max-w-32 rounded-full border border-white/20 bg-black/70 px-2 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:max-w-40"
          >
            {show.episodes.map((item, i) => (
              <option key={item.fileId} value={i}>
                S{item.season} · {item.displayName ?? `Episode ${item.number}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-expanded={captionsOpen}
            aria-controls={captionsOpen ? captionsId : undefined}
            onClick={() => setCaptionsOpen((open) => !open)}
            className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ChatBubbleBottomCenterTextIcon
              aria-hidden="true"
              className="size-4"
            />
            Captions
          </button>
          {captionsOpen && (
            <section
              id={captionsId}
              aria-label="Caption options"
              className="absolute top-14 right-0 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-white/20 bg-[#15191e] p-4 text-sm leading-relaxed text-white shadow-2xl"
            >
              <p className="font-semibold">Watch with captions</p>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-white/85">
                <li>
                  Use CC in the video player if a caption track is available.
                </li>
                <li>
                  If there is no CC option, in desktop Chrome open Settings →
                  Accessibility and turn on Live Caption. Chrome can generate
                  captions for the video as it plays.
                </li>
              </ol>
              <p className="mt-3 text-white/70">
                The file owner can add corrected caption tracks in Drive.
              </p>
              <a
                href={episodeDriveUrl(show, episode)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block font-medium text-white underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Open this video in Drive
              </a>
            </section>
          )}
        </>
      }
    />
  );
}
