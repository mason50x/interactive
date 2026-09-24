"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Monogram } from "@/components/app/chat/monogram";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BOT_ID, HEARTBEAT_MS, personName } from "@/lib/chat";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/** Report this reader's room presence and show the active readers' faces. */
export function Present({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const here = useMutation(api.chat.presence.here);
  const gone = useMutation(api.chat.presence.gone);
  const presence = useQuery(api.chat.presence.count, { conversationId });

  /**
   * Beat while the tab is in front of somebody, and stop when it is not.
   *
   * A background tab is not in the room. It stops beating rather than
   * announcing itself gone, so a glance at another window for ten seconds does
   * not take you out of a conversation you are in the middle of — the row ages
   * out on its own if the glance turns into an afternoon. Coming back beats
   * immediately rather than waiting out the interval, because the first thing
   * somebody does on returning is read the faces.
   *
   * Leaving for another conversation *is* announced, in the cleanup. That is
   * the case where waiting out the window would be visibly wrong: the room you
   * walked out of should not still be counting you while you read the next one.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    function beat() {
      void here({ conversationId });
    }

    function start() {
      if (timer !== undefined) return;
      beat();
      timer = setInterval(beat, HEARTBEAT_MS);
    }

    function stop() {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
    }

    function onVisibility() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
      void gone({ conversationId });
    };
  }, [conversationId, here, gone]);

  // `undefined` is the first render, before the count has arrived; `null` is a
  // conversation this account is not an active member of, which is also the
  // only state `conversations.get` would be drawing a header for at all.
  if (presence === undefined || presence === null) return null;

  const remaining = Math.max(0, presence.present - presence.people.length);
  return (
    <TooltipProvider delay={250}>
      <div
        className="hidden shrink-0 items-center sm:flex"
        aria-label={`${presence.present}${presence.capped ? "+" : ""} online in this conversation`}
      >
        {presence.people.map((person, index) => (
          <Tooltip key={person.clerkId}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`${personName(person)} is online`}
                />
              }
              className={`relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${index > 0 ? "-ml-2" : ""}`}
            >
              <Monogram
                handle={person.handle}
                imageUrl={person.avatarUrl}
                hue={person.avatarHue}
                emoji={person.avatarEmoji}
                initials={person.avatarInitials}
                className="size-7 border-2 border-background text-[0.6875rem]"
              />
            </TooltipTrigger>
            <TooltipContent>{personName(person)} is online</TooltipContent>
          </Tooltip>
        ))}
        {remaining > 0 || presence.capped ? (
          <span className="-ml-1.5 flex size-7 items-center justify-center rounded-full border-2 border-background bg-surface-muted text-[0.625rem] font-semibold text-faint">
            +{remaining}
            {presence.capped ? "+" : ""}
          </span>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

/** The peer's app activity, with a local expiry when their last beat stops. */
export function PeerPresence({
  conversationId,
  peerClerkId,
}: {
  conversationId: Id<"conversations">;
  peerClerkId: string;
}) {
  const expiresAt = useQuery(
    api.chat.presence.peerStatus,
    peerClerkId === BOT_ID ? "skip" : { conversationId },
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  if (peerClerkId !== BOT_ID && expiresAt === undefined) return null;
  const online =
    peerClerkId === BOT_ID ||
    (expiresAt !== undefined && expiresAt !== null && expiresAt > now);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${online ? "bg-success" : "bg-muted-foreground"}`}
      />
      {online ? "Online" : "Offline"}
    </span>
  );
}
