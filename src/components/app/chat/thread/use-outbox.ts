"use client";

import { useMutation } from "convex/react";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  emptyOutbox,
  getOutbox,
  outboxKey,
  subscribeOutbox,
  updateOutbox,
  claimOutboxSend,
  releaseOutboxSend,
  isOutboxDurable,
  type OutboxEntry,
} from "@/lib/chat-outbox";
import { refusalMessage } from "@/lib/chat";
import { rememberPreview } from "@/lib/images";

const onlineSnapshot = () =>
  typeof navigator === "undefined" || navigator.onLine;
const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

export function useOutbox(
  account: string | null | undefined,
  conversationId: Id<"conversations">,
) {
  const key = account ? outboxKey(account, conversationId) : null;
  const entries = useSyncExternalStore(
    subscribeOutbox,
    () => getOutbox(key),
    emptyOutbox,
  );
  const online = useSyncExternalStore(
    subscribeOnline,
    onlineSnapshot,
    () => true,
  );
  const send = useMutation(api.chat.messages.send);

  useEffect(() => {
    if (!key || !online) return;
    const entry = entries.find((item) => item.status === "queued");
    if (
      !entry ||
      entries.some((item) => item.status === "sending") ||
      !claimOutboxSend(key, entry.nonce)
    )
      return;
    updateOutbox(key, (rows) =>
      rows.map((row) =>
        row.nonce === entry.nonce
          ? { ...row, status: "sending", error: undefined }
          : row,
      ),
    );
    void (async () => {
      try {
        const result = await send({
          conversationId,
          body: entry.body,
          attachmentIds: entry.attachmentIds.length
            ? entry.attachmentIds
            : undefined,
          replyToId: entry.replyTo?._id,
          poll: entry.poll,
          clientNonce: entry.nonce,
          expectedAuthorClerkId: account ?? undefined,
        });
        if (result.ok) {
          for (const image of entry.images)
            rememberPreview(image.attachmentId, image.url);
        }
        updateOutbox(key, (rows) =>
          result.ok
            ? rows.filter((row) => row.nonce !== entry.nonce)
            : rows.map((row) =>
                row.nonce === entry.nonce
                  ? {
                      ...row,
                      status: "failed",
                      error: refusalMessage(result.refusal),
                      uncertain: false,
                    }
                  : row,
              ),
        );
      } catch {
        updateOutbox(key, (rows) =>
          rows.map((row) =>
            row.nonce === entry.nonce
              ? {
                  ...row,
                  status: "failed",
                  uncertain: true,
                  error:
                    "Delivery could not be confirmed. Retry to check and finish sending this same message.",
                }
              : row,
          ),
        );
      } finally {
        releaseOutboxSend(key, entry.nonce);
      }
    })();
  }, [key, entries, online, send, conversationId, account]);

  return {
    entries,
    online,
    storageWarning: !isOutboxDurable(key),
    enqueue: (entry: Omit<OutboxEntry, "nonce" | "createdAt" | "status">) => {
      if (!key) throw new Error("Your account is still loading.");
      updateOutbox(key, (rows) => [
        ...rows,
        {
          ...entry,
          nonce: crypto.randomUUID(),
          createdAt: Math.max(
            Date.now(),
            (rows.at(-1)?.createdAt ?? 0) + 0.001,
          ),
          status: "queued",
        },
      ]);
    },
    retry: (nonce: string) => {
      if (key)
        updateOutbox(key, (rows) =>
          rows.map((row) =>
            row.nonce === nonce && row.status === "failed"
              ? { ...row, status: "queued", error: undefined }
              : row,
          ),
        );
    },
    discard: (nonce: string, keepPreviews = false) => {
      if (key) {
        const discarded = getOutbox(key).find((entry) => entry.nonce === nonce);
        if (discarded && discarded.status !== "sending" && !keepPreviews) {
          for (const image of discarded.images) {
            if (image.url.startsWith("blob:")) URL.revokeObjectURL(image.url);
          }
        }
        updateOutbox(key, (rows) =>
          rows.filter((row) => row.nonce !== nonce || row.status === "sending"),
        );
      }
    },
  };
}
