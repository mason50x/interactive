"use client";

import { useAction, useMutation } from "convex/react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import { refusalMessage } from "@/lib/chat";
import {
  MAX_IMAGES_PER_MESSAGE,
  isImageFile,
  prepareImage,
} from "@/lib/images";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Pictures in the composer, from the moment one is chosen until it is sent.
 *
 * Three calls to the server per picture — see the note at the top of
 * `convex/chat/attachments.ts` for why it is three — and every one of them
 * happens here, before the picture is ever offered to the send. What the
 * send receives is a list of ids the server has already said yes to.
 *
 * This is the composer's one piece of state that is a machine rather than a
 * value, which is why it is its own hook: the tray, the ghosts it closes
 * over, the seats counted before a file has decoded, and the uploads that
 * were disowned mid-flight all have to agree with each other, and the
 * composer only needs the tray and a handful of verbs.
 */

/**
 * A picture in the tray, from the moment it is chosen until it is sent.
 *
 * `preview` is an object URL for the shrunk blob. It is drawn in the tray,
 * then in the placeholder message while the send is out, and revoked once
 * the picture has left both. The three states are the three waits — the
 * bytes going up, the classifier looking, done — and only `ready` carries an
 * `attachmentId`, because only `ready` has one the server will accept.
 *
 * A refused picture has no state. It leaves the tray with a sentence over
 * the box, exactly as a refused message does, and nothing of it is kept.
 */
export type Attached = {
  key: string;
  preview: string;
  width: number;
  height: number;
  state: "uploading" | "checking" | "ready";
  attachmentId?: Id<"attachments">;
};

/** The one composer notice that is not a refusal from the server. */
const TOO_MANY = "Up to four pictures on one message.";

export function useAttachments({
  pictures,
  onNotice,
}: {
  /** Whether pictures are on at all. Off, `addFiles` is a shut door. */
  pictures: boolean;
  /** Where a refusal, or the cap, is said. */
  onNotice: (message: string) => void;
}) {
  const uploadUrl = useMutation(api.chat.attachments.uploadUrl);
  const discard = useMutation(api.chat.attachments.discard);
  const check = useAction(api.chat.attachments.check);

  const [attached, setAttached] = useState<Attached[]>([]);

  /**
   * What the tray last held, kept while it closes.
   *
   * The tray's height is animated by a grid row that goes from `1fr` to
   * `0fr` — see `AttachmentTray` — and a row shrinking over nothing is a row
   * that is already gone. So the last thumbnails stay drawn under the
   * closing row until `settle` says it has shut. Set during render, which is
   * the sanctioned shape for state that mirrors other state.
   */
  const [ghost, setGhost] = useState<Attached[]>([]);
  if (attached.length > 0 && ghost !== attached) setGhost(attached);

  /**
   * Previews whose thumbnails are still on screen as ghosts. Revoking them
   * the moment they left the tray drew broken images for the length of the
   * close; they are released when it has finished.
   */
  const retired = useRef<string[]>([]);

  function releaseRetired() {
    for (const url of retired.current) URL.revokeObjectURL(url);
    retired.current = [];
  }

  /**
   * How many the tray holds, counted the moment a file is accepted rather
   * than when its row appears in state. Six files dropped at once arrive in
   * one event, and the cap has to be applied across them before any has
   * finished decoding.
   */
  const count = useRef(0);

  /**
   * Keys taken out of the tray while their upload was still out.
   *
   * An upload cannot be cancelled, only disowned: the bytes finish landing,
   * and whichever step comes next finds the key here and stops. A file that
   * was never claimed is the sweep's; one that was claimed is discarded on
   * the spot.
   */
  const removed = useRef(new Set<string>());

  /** The tray as of the last render, for the unmount below. */
  const tray = useRef<Attached[]>([]);
  useEffect(() => {
    tray.current = attached;
  }, [attached]);

  // Leaving the conversation with pictures in the box. Their previews are
  // memory and their rows are storage, and neither is coming back — the
  // rows would be swept within the hour, but a cross that was never pressed
  // should not cost an hour of a file.
  useEffect(() => {
    return () => {
      for (const entry of tray.current) {
        URL.revokeObjectURL(entry.preview);
        if (entry.attachmentId !== undefined) {
          void discard({ attachmentId: entry.attachmentId });
        }
      }
      for (const url of retired.current) URL.revokeObjectURL(url);
    };
  }, [discard]);

  function patch(key: string, changes: Partial<Attached>) {
    setAttached((list) =>
      list.map((entry) =>
        entry.key === key ? { ...entry, ...changes } : entry,
      ),
    );
  }

  /**
   * Out of the tray, one seat freed, and the preview released — now if the
   * thumbnail vanishes at once, later if it is the last one and the tray is
   * about to close over it. See `retired`.
   */
  function drop(key: string) {
    count.current = Math.max(0, count.current - 1);
    setAttached((list) => {
      const entry = list.find((candidate) => candidate.key === key);
      const rest = list.filter((candidate) => candidate.key !== key);
      if (entry !== undefined) {
        if (rest.length === 0) retired.current.push(entry.preview);
        else URL.revokeObjectURL(entry.preview);
      }
      return rest;
    });
  }

  function fail(key: string, message: string) {
    drop(key);
    onNotice(message);
  }

  async function attach(file: File) {
    const key = crypto.randomUUID();

    const prepared = await prepareImage(file);
    if (prepared === null) {
      count.current = Math.max(0, count.current - 1);
      onNotice("That picture could not be read.");
      return;
    }

    const preview = URL.createObjectURL(prepared.blob);
    setAttached((list) => [
      ...list,
      {
        key,
        preview,
        width: prepared.width,
        height: prepared.height,
        state: "uploading",
      },
    ]);

    try {
      const slot = await uploadUrl({});
      if (!slot.ok) {
        fail(key, refusalMessage(slot.refusal));
        return;
      }

      const response = await fetch(slot.url, {
        method: "POST",
        headers: { "Content-Type": prepared.blob.type },
        body: prepared.blob,
      });
      if (!response.ok) {
        fail(key, refusalMessage("image"));
        return;
      }
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };

      // Taken out while the bytes were going up. Nothing claimed it, so
      // there is nothing to discard; the sweep reclaims the file.
      if (removed.current.delete(key)) return;

      patch(key, { state: "checking" });
      const verdict = await check({
        reservationId: slot.reservationId,
        storageId,
        width: prepared.width,
        height: prepared.height,
      });

      // Taken out while the classifier was looking. It is claimed now, so
      // if it passed it has a row to release.
      if (removed.current.delete(key)) {
        if (verdict.ok) void discard({ attachmentId: verdict.attachmentId });
        return;
      }

      if (!verdict.ok) {
        fail(key, refusalMessage(verdict.refusal));
        return;
      }
      patch(key, { state: "ready", attachmentId: verdict.attachmentId });
    } catch {
      fail(key, refusalMessage("image"));
    }
  }

  /**
   * The one way pictures get in, whether they were picked, pasted, or
   * dropped. Files that are not pictures are ignored rather than refused —
   * a paste of a spreadsheet cell has a file in it that nobody meant to send.
   */
  function addFiles(files: File[]) {
    if (!pictures) return;
    const images = files.filter(isImageFile);
    if (images.length === 0) return;

    const room = MAX_IMAGES_PER_MESSAGE - count.current;
    if (images.length > room) onNotice(TOO_MANY);

    for (const file of images.slice(0, Math.max(0, room))) {
      count.current += 1;
      void attach(file);
    }
  }

  function remove(entry: Attached) {
    if (entry.attachmentId !== undefined) {
      void discard({ attachmentId: entry.attachmentId });
    } else {
      removed.current.add(entry.key);
    }
    drop(entry.key);
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...event.clipboardData.files].filter(isImageFile);
    if (files.length === 0) return;
    // A pasted picture is the paste; the browser would otherwise also drop
    // its filename into the box as text.
    event.preventDefault();
    addFiles(files);
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files === null ? [] : [...event.target.files];
    // Cleared so picking the same file twice fires twice.
    event.target.value = "";
    addFiles(files);
  }

  /** The tray, emptied — the pictures have gone with a send. */
  function clear() {
    setAttached([]);
    count.current = 0;
  }

  /** The pictures back in the tray, after a send was refused for its words. */
  function restore(list: Attached[]) {
    setAttached(list);
    count.current = list.length;
  }

  /** The tray has finished closing: the ghosts and their previews may go. */
  function settle() {
    if (attached.length > 0) return;
    setGhost([]);
    releaseRetired();
  }

  const ready = attached.filter((entry) => entry.state === "ready");
  const waiting = ready.length !== attached.length;

  return {
    attached,
    ghost,
    /** The ones the server has said yes to. */
    ready,
    /** Whether any picture is still going up or being looked at. */
    waiting,
    addFiles,
    remove,
    onPaste,
    onPick,
    clear,
    restore,
    settle,
  };
}
