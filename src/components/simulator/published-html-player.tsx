"use client";

import { PlaytimeGate } from "@/components/app/experience-quota";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";
import {
  cachePublishedHtml,
  downloadPublishedHtml,
  publishedHtmlOwner,
} from "@/lib/simulator/published-html";
import { CenteredSpinner } from "@/components/ui/spinner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const Player = dynamic(() => import("./html-player"), {
  ssr: false,
  loading: () => <CenteredSpinner />,
});

export function PublishedHtmlPlayer({ id }: { id: string }) {
  const { userId } = useAuth();
  if (!userId) return <CenteredSpinner />;
  return (
    <PlaytimeGate>
      <PublishedSession key={`${userId}:${id}`} id={id} userId={userId} />
    </PlaytimeGate>
  );
}

function PublishedSession({ id, userId }: { id: string; userId: string }) {
  const entry = useAuthedQuery(api.simulator.published.get, { id });
  const [ready, setReady] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const owner = userId ? publishedHtmlOwner(userId, id) : "";
  const contentHash = entry?.contentHash;
  const url = entry?.url;
  const label = entry?.label;
  const byteLength = entry?.byteLength;
  useEffect(() => {
    if (!owner || !contentHash || !url || !label || byteLength === undefined)
      return;
    const controller = new AbortController();
    let alive = true;
    void (async () => {
      try {
        const program = await downloadPublishedHtml(
          { url, contentHash, label, byteLength },
          controller.signal,
        );
        if (!alive) return;
        await cachePublishedHtml(owner, program);
        if (alive) {
          setReady(`${owner}:${contentHash}`);
          setError("");
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error ? e.message : "Could not load this simulation.",
          );
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [owner, contentHash, url, label, byteLength, retry]);
  if (entry === null || error)
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 p-8">
        <Alert>
          {entry === null
            ? "This published simulation is no longer available."
            : error}
        </Alert>
        <div className="flex gap-3">
          <ButtonLink href="/learning-simulator?mode=html" variant="outline">
            Back to simulators
          </ButtonLink>
          {entry && (
            <Button
              onClick={() => {
                setError("");
                setRetry((v) => v + 1);
              }}
            >
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  if (!entry || ready !== `${owner}:${contentHash}`) return <CenteredSpinner />;
  return (
    <Player
      key={`${owner}:${contentHash}`}
      owner={owner}
      contentHash={entry.contentHash}
      published
    />
  );
}
