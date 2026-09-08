"use client";
import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { ChevronRightIcon } from "@heroicons/react/24/solid";
import styles from "./html-player.module.css";
import { api } from "../../../convex/_generated/api";
import { Button, ButtonLink } from "@/components/ui/button";
import { CenteredSpinner } from "@/components/ui/spinner";
import { htmlDocument } from "@/lib/simulator/html-document";
import { acquirePlayerLock } from "@/lib/simulator/lock";
import {
  importHtml,
  openHtml,
  readHtmlEntry,
  readHtmlProgram,
  saveHtml,
  validateHtmlSave,
  type HtmlEntry,
} from "@/lib/simulator/html-store";
const BACK = "/dashboard/learning-simulator?mode=html";
export default function HtmlPlayer({
  owner,
  contentHash,
}: {
  owner: string;
  contentHash: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useConvexAuth(),
    register = useMutation(api.simulator.html.register);
  const accepting = useRef(true);
  const registered = useRef(false),
    queue = useRef<Promise<unknown>>(Promise.resolve());
  const [entry, setEntry] = useState<HtmlEntry>(),
    [document, setDocument] = useState(""),
    [run, setRun] = useState(0),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [metadataError, setMetadataError] = useState("");
  const [controlsOpen, setControlsOpen] = useState(false),
    [saveError, setSaveError] = useState(""),
    [fullscreen, setFullscreen] = useState(false),
    [expanded, setExpanded] = useState(false);
  const hasFile = !!document;
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
    let alive = true,
      release: (() => void) | null = null;
    let windowStart = Date.now(),
      requests = 0;
    const session = crypto.randomUUID();
    accepting.current = true;
    const message = (event: MessageEvent) => {
      const m = event.data;
      if (
        !alive ||
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null" ||
        !m ||
        m.channel !== "interactive-html" ||
        m.token !== session ||
        !Number.isSafeInteger(m.id)
      )
        return;
      const reply = (error?: string) => {
        if (alive)
          frame.current?.contentWindow?.postMessage(
            { channel: "interactive-html", token: session, id: m.id, error },
            "*",
          );
      };
      if (Date.now() - windowStart > 1000) {
        windowStart = Date.now();
        requests = 0;
      }
      if (++requests > 20) {
        reply(
          "Save requests are too frequent. Await simulator.save() and save meaningful changes.",
        );
        return;
      }
      if (m.type === "ready") {
        reply();
        return;
      }
      if (m.type !== "save") return;
      if (!accepting.current) {
        reply("The player is restoring progress. Try again after it reloads.");
        return;
      }
      // The only durable write available to imported HTML is its own bounded local save.
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          if (!alive) return;
          try {
            await saveHtml(owner, contentHash, m.value);
            const next = await readHtmlEntry(owner, contentHash);
            if (alive) {
              setEntry(next);
              setSaveError("");
              reply();
            }
          } catch (e) {
            const reason =
              e instanceof Error ? e.message : "Local save failed.";
            if (alive) {
              setSaveError("Progress couldn’t save on this device. " + reason);
              reply(reason);
            }
          }
        });
    };
    // Documents that expose a save-request handler are captured automatically.
    // Direct simulator.save() calls still persist each meaningful state change.
    const requestSave = () =>
      frame.current?.contentWindow?.postMessage(
        {
          channel: "interactive-html",
          token: session,
          type: "request-save",
        },
        "*",
      );
    const autosave = window.setInterval(() => {
      if (!window.document.hidden) requestSave();
    }, 10000);
    const visibility = () => {
      if (window.document.hidden) requestSave();
    };
    window.document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", requestSave);
    window.addEventListener("message", message);
    void (async () => {
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
          setDocument(
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
    })();
    return () => {
      alive = false;
      window.clearInterval(autosave);
      window.document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", requestSave);
      window.removeEventListener("message", message);
      void queue.current.finally(() => release?.());
    };
  }, [owner, contentHash, run]);
  useEffect(() => {
    const change = () =>
      setFullscreen(window.document.fullscreenElement === stage.current);
    window.document.addEventListener("fullscreenchange", change);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        setControlsOpen(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.document.removeEventListener("fullscreenchange", change);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  function reload() {
    accepting.current = false;
    setDocument("");
    setReady(false);
    setError("");
    setSaveError("");
    setRun((v) => v + 1);
  }
  async function fillScreen() {
    try {
      if (expanded) {
        setExpanded(false);
        return;
      }
      if (window.document.fullscreenElement)
        await window.document.exitFullscreen();
      else if (stage.current?.requestFullscreen)
        await stage.current.requestFullscreen();
      else setExpanded((v) => !v);
    } catch {
      setExpanded((v) => !v);
    }
  }
  if (!ready) return <CenteredSpinner />;
  if (!hasFile)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
        <h1 className="text-2xl font-semibold">
          {error ? "HTML couldn’t open" : "Open the original HTML"}
        </h1>
        <p
          role={error ? "alert" : undefined}
          className="max-w-md text-sm text-muted-foreground"
        >
          {error ||
            "This device doesn’t have the file yet. Choose the matching original HTML. Progress is stored separately on each device."}
        </p>
        <label className="cursor-pointer rounded-lg border border-border bg-background px-4 py-2 text-sm">
          Choose HTML
          <input
            type="file"
            accept=".html,.htm"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const p = await openHtml(f);
                if (p.contentHash !== contentHash)
                  throw new Error(
                    "Choose the same HTML file to resume this entry.",
                  );
                await importHtml(owner, p);
                reload();
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not open file.",
                );
              }
            }}
          />
        </label>
        <div className="flex gap-3">
          <ButtonLink href={BACK} variant="ghost">
            Back to HTML
          </ButtonLink>
          {error && (
            <Button onClick={reload} variant="outline">
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  return (
    <div
      ref={stage}
      className={`${expanded ? "fixed inset-0 z-50" : "relative size-full"} isolate overflow-hidden bg-white`}
    >
      <iframe
        ref={frame}
        key={run}
        title={entry?.label ?? "HTML simulation"}
        srcDoc={document}
        sandbox="allow-scripts allow-pointer-lock"
        referrerPolicy="no-referrer"
        className="block size-full border-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-500"
        onLoad={() => frame.current?.focus()}
      />
      <div className="absolute top-3 left-3 z-10 max-w-[calc(100%-1.5rem)]">
        <div className={styles.controls} data-open={controlsOpen}>
          <button
            type="button"
            aria-label={
              controlsOpen ? "Hide player controls" : "Show player controls"
            }
            aria-expanded={controlsOpen}
            aria-controls="html-player-controls"
            className={styles.toggle}
            onClick={() => setControlsOpen((v) => !v)}
          >
            <ChevronRightIcon
              className="size-4 transition-transform duration-300 motion-reduce:transition-none"
              style={{ transform: controlsOpen ? "rotate(180deg)" : undefined }}
            />
          </button>
          <div
            id="html-player-controls"
            className={styles.actions}
            inert={!controlsOpen}
          >
            <ButtonLink
              href={BACK}
              variant="ghost"
              aria-label="Back to HTML library"
              className={styles.action}
            >
              <ArrowLeftIcon className="size-4" />
            </ButtonLink>
            <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium">
              {entry?.label ?? "HTML"}
            </span>
            <Button
              variant="ghost"
              aria-label="Reload HTML from saved progress"
              onClick={reload}
              className={styles.action}
            >
              <ArrowPathIcon className="size-4" />
            </Button>
            <Button
              variant="ghost"
              aria-label={
                fullscreen || expanded ? "Exit fullscreen" : "Enter fullscreen"
              }
              onClick={() => void fillScreen()}
              className={styles.action}
            >
              {fullscreen || expanded ? (
                <XMarkIcon className="size-4" />
              ) : (
                <ArrowsPointingOutIcon className="size-4" />
              )}
            </Button>
          </div>
        </div>
        {saveError && (
          <p
            role="alert"
            className="mt-2 max-w-72 rounded-lg bg-zinc-950/90 px-3 py-2 text-xs text-white"
          >
            {saveError}
          </p>
        )}
        {controlsOpen && metadataError && (
          <p className="mt-2 max-w-72 rounded-lg bg-zinc-950/90 px-3 py-2 text-xs text-white">
            {metadataError}
          </p>
        )}
      </div>
    </div>
  );
}
