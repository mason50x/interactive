"use client";

import { useEffect, useRef } from "react";

import { api } from "@convex/_generated/api";
import { REMOTE_SOUND_FRESH_MS } from "@/lib/remote-sound";
import { playSoundEffect } from "@/lib/sound-effects";
import { useAuthedQuery } from "@/lib/use-authed-query";

/** Framed by the app itself, as a split-view pane; the top window plays. */
function isFramed() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Plays the sound a CEO sends to this account from the Admin user directory.
 *
 * Mounted once in the signed-in shell. The subscription is the whole
 * mechanism: `remoteSound.mine` re-delivers whenever the account's ping row is
 * patched, and this plays each `sentAt` it has not heard yet, at the volume
 * the CEO chose. The one it finds on first subscribing is played only if the
 * server says it is still fresh, so reopening the app an hour later does not
 * replay the last sound, while a tab that was still loading when the button
 * was pressed does not miss it.
 *
 * Nothing is acknowledged back to the server: two tabs signed in as the same
 * account should both play, and an acknowledgement from one would silence the
 * other.
 */
export function RemoteSound() {
  const ping = useAuthedQuery(api.remoteSound.mine, {});
  // `undefined` until the first answer, then the `sentAt` last heard (or
  // `null` once a first answer of "no ping" has been seen), so a later ping
  // counts as arriving rather than as the snapshot on subscribe.
  const heard = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    // The query reads `undefined` again while Convex re-checks the session;
    // that is not a new answer.
    if (ping === undefined) return;
    if (ping === null) {
      if (heard.current === undefined) heard.current = null;
      return;
    }
    if (heard.current === ping.sentAt) return;
    const onSubscribe = heard.current === undefined;
    heard.current = ping.sentAt;
    if (onSubscribe && ping.ageMs > REMOTE_SOUND_FRESH_MS) return;
    if (isFramed()) return;
    playSoundEffect(ping.sound, ping.volume);
  }, [ping]);

  return null;
}
