"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { HEARTBEAT_MS } from "@/lib/chat";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * How many people are in this conversation, right now, with a dot to say the
 * number is alive.
 *
 * It replaces a count of memberships, which was a different fact wearing the
 * same words: a group of forty read by two people said "40 in here", and the
 * room everybody is in said nothing, because counting its members would have
 * been the one query on the site whose cost grows with the size of it. Presence
 * has neither problem — it is bounded by who is awake and looking, and it is
 * the same question in a group of six as in a room of six hundred.
 *
 * The component both reports and reads. That pairing is deliberate: the only
 * place this number is shown is a conversation somebody has open, and a
 * conversation somebody has open is exactly what a beat means. Mounting is
 * arriving and unmounting is leaving, so there is no lifecycle to keep in step
 * with the one React already runs.
 *
 * ## The dot
 *
 * Pulsing rather than static, and green rather than the brand blue, because it
 * is not a count of anything stored — it is a claim that the number beside it is
 * true *at this second*, and a still dot would be a claim about the page having
 * loaded. Under `prefers-reduced-motion` the blanket rule at the foot of
 * `globals.css` stops the ring and leaves the dot, which is the right thing to
 * be left with: a green dot that is not going anywhere still reads as live.
 */
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
   * somebody does on returning is read the number.
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

  return (
    <span className="hidden shrink-0 items-center gap-2 text-[0.8125rem] text-faint sm:flex">
      <span aria-hidden className="relative flex size-2 shrink-0">
        {/* Slower than Tailwind's own second, which at this size reads as an
            alarm rather than a pulse. */}
        <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-70 [animation-duration:2.4s]" />
        <span className="relative size-2 rounded-full bg-success" />
      </span>
      {`${presence.present}${presence.capped ? "+" : ""} in here`}
    </span>
  );
}
