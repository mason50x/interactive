"use client";

import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { CenteredSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { htmlDocument } from "@/lib/simulator/html-document";
import {
  createRateLimiter,
  postToFrame,
  readFrameRequest,
} from "@/lib/simulator/html-bridge";
import { acquirePlayerLock } from "@/lib/simulator/lock";
import { useFullscreen } from "@/lib/simulator/use-fullscreen";
import {
  importHtml,
  openHtml,
  readHtmlEntry,
  readHtmlProgram,
  saveHtml,
  validateHtmlSave,
  type HtmlEntry,
} from "@/lib/simulator/html-store";
import { useOriginalFilePicker } from "./file-picker";
import { HtmlFilePrompt } from "./html-file-prompt";
import { HtmlPlayerControls } from "./html-player-controls";

const BACK = "/dashboard/learning-simulator?mode=html";

/**
 * One HTML session: an imported page running in a sandboxed frame, with
 * its progress kept in this device's store.
 *
 * The page is untrusted, so the player is built around giving it as little
 * as possible: a `srcdoc` with a locked-down policy from `html-document`,
 * no network, and one channel back to us that carries only its own saved
 * JSON. Everything the page can ask for comes through `message` events
 * validated in `html-bridge`; everything we ask of it is a request to save.
 *
 * `run` is the session counter. Bumping it tears the whole effect down and
 * builds it again — a new token, a fresh document seeded from the latest
 * autosave, a new frame — which is what "reload" and "file just imported"
 * both mean here.
 */
export default function HtmlPlayer({
  owner,
  contentHash,
}: {
  owner: string;
  contentHash: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useConvexAuth();
  const register = useMutation(api.simulator.html.register);
  // Saves are refused between "reload pressed" and "new session started" so
  // a page in its last moments cannot overwrite the autosave the next one
  // is about to be seeded from.
  const accepting = useRef(true);
  const registered = useRef(false);
  // Every save runs after the one before it, whatever order the page sent
  // them in, so the store always ends up holding the last one the page saw
  // succeed.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [entry, setEntry] = useState<HtmlEntry>();
  const [srcDoc, setSrcDoc] = useState("");
  const [run, setRun] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [metadataError, setMetadataError] = useState("");
  const [saveError, setSaveError] = useState("");
  const { fullscreen, expanded, toggle } = useFullscreen(stage);
  const hasFile = !!srcDoc;
  // The account only ever learns the name and the hash, once per mount, and
  // only if it is reachable: a failure here costs a note, not the session.
  useEffect(() => {
    if (!entry || !isAuthenticated || registered.current) return;
    registered.current = true;
    void register({ contentHash, label: entry.label }).catch(() => {
      setMetadataError(
        "File is kept on this device. Account library metadata could not sync.",
      );
    });
  }, [contentHash, entry, isAuthenticated, register]);
  useEffect(() => {
    let alive = true;
    let release: (() => void) | null = null;
    // The token is minted per session and written into the document, so a
    // message can only be answered by the frame that was built with it.
    const session = crypto.randomUUID();
    const withinLimit = createRateLimiter(20, 1000);
    accepting.current = true;

    const reply = (id: number, error?: string) => {
      if (alive)
        postToFrame(frame.current?.contentWindow, session, { id, error });
    };

    // Writes the page's value as the autosave, then reads the entry back so
    // the label and timestamps on screen follow the store rather than a
    // guess at what it did.
    const enqueueSave = (id: number, value: unknown) => {
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          if (!alive) return;
          try {
            await saveHtml(owner, contentHash, value);
            const next = await readHtmlEntry(owner, contentHash);
            if (alive) {
              setEntry(next);
              setSaveError("");
              reply(id);
            }
          } catch (e) {
            const reason =
              e instanceof Error ? e.message : "Local save failed.";
            if (alive) {
              setSaveError("Progress couldn’t save on this device. " + reason);
              reply(id, reason);
            }
          }
        });
    };

    // The only two requests a page can make: `ready`, answered so its
    // `simulator.load()` resolves, and `save`, which is the one durable
    // write imported HTML has. Anything off-channel is dropped in silence.
    const handleFrameMessage = (event: MessageEvent) => {
      if (!alive) return;
      const request = readFrameRequest(
        event,
        frame.current?.contentWindow,
        session,
      );
      if (!request) return;
      if (!withinLimit()) {
        reply(
          request.id,
          "Save requests are too frequent. Await simulator.save() and save meaningful changes.",
        );
        return;
      }
      if (request.type === "ready") {
        reply(request.id);
        return;
      }
      if (request.type !== "save") return;
      if (!accepting.current) {
        reply(
          request.id,
          "The player is restoring progress. Try again after it reloads.",
        );
        return;
      }
      enqueueSave(request.id, request.value);
    };

    // A page that listens for `simulator:save-request` is captured on a
    // timer and when the tab goes away; one that only calls
    // `simulator.save()` itself is saved whenever it chooses to.
    const requestSave = () =>
      postToFrame(frame.current?.contentWindow, session, {
        type: "request-save",
      });
    const autosave = window.setInterval(() => {
      if (!document.hidden) requestSave();
    }, 10000);
    const visibility = () => {
      if (document.hidden) requestSave();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", requestSave);
    window.addEventListener("message", handleFrameMessage);

    // Take the device lock for this entry, then build the document from the
    // stored bytes seeded with the latest autosave. No bytes is not an
    // error: it is the "choose the original" screen.
    const openSession = async () => {
      try {
        release = await acquirePlayerLock(
          `html-simulator:${owner}:${contentHash}`,
        );
        if (!alive) {
          release?.();
          return;
        }
        if (!release)
          throw new Error(
            navigator.locks
              ? "This HTML is open in another tab. Close it there and retry."
              : "This browser needs Web Locks support to coordinate local saves.",
          );
        const [program, saved] = await Promise.all([
          readHtmlProgram(owner, contentHash),
          readHtmlEntry(owner, contentHash),
        ]);
        if (!alive) return;
        setEntry(saved);
        if (program) {
          const initial = saved?.saves.auto
            ? validateHtmlSave(saved.saves.auto, contentHash).json
            : null;
          setSrcDoc(
            htmlDocument(
              new TextDecoder().decode(program.bytes),
              session,
              initial,
            ),
          );
        }
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Could not open HTML.");
      } finally {
        if (alive) setReady(true);
      }
    };
    void openSession();

    return () => {
      alive = false;
      window.clearInterval(autosave);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", requestSave);
      window.removeEventListener("message", handleFrameMessage);
      // The lock outlives the effect until the last queued save has landed,
      // so the next session cannot start reading while this one is writing.
      void queue.current.finally(() => release?.());
    };
  }, [owner, contentHash, run]);
  function reload() {
    accepting.current = false;
    setSrcDoc("");
    setReady(false);
    setError("");
    setSaveError("");
    setRun((value) => value + 1);
  }
  const picker = useOriginalFilePicker({
    contentHash,
    open: openHtml,
    mismatch: "Choose the same HTML file to resume this entry.",
    onOpen: async (program) => {
      await importHtml(owner, program);
      reload();
    },
    onError: setError,
  });
  if (!ready) return <CenteredSpinner />;
  if (!hasFile)
    return (
      <HtmlFilePrompt
        error={error}
        picker={picker}
        back={BACK}
        retry={reload}
      />
    );
  return (
    <div
      ref={stage}
      className={cn(
        expanded ? "fixed inset-0 z-50" : "relative size-full",
        "isolate overflow-hidden bg-white",
      )}
    >
      <iframe
        ref={frame}
        key={run}
        title={entry?.label ?? "HTML simulation"}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-pointer-lock"
        referrerPolicy="no-referrer"
        className="block size-full border-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-500"
        onLoad={() => frame.current?.focus()}
      />
      <HtmlPlayerControls
        label={entry?.label ?? "HTML"}
        back={BACK}
        fullscreen={fullscreen || expanded}
        reload={reload}
        toggleFullscreen={() => void toggle()}
        saveError={saveError}
        metadataError={metadataError}
      />
    </div>
  );
}
