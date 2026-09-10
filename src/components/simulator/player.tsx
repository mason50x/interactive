"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  PauseIcon,
} from "@heroicons/react/24/outline";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Builtin } from "@/lib/simulator/types";
import { readProgram } from "@/lib/simulator/local-store";
import { openProgram } from "@/lib/simulator/files";
import { useSimulator } from "@/lib/simulator/use-simulator";
import { useSimulatorSession } from "@/components/simulator/session-provider";
import {
  HiddenFileInput,
  useOriginalFilePicker,
} from "@/components/simulator/file-picker";
import { Reveal } from "@/components/simulator/reveal";
import { SaveStatus } from "@/components/simulator/save-status";
import { GameBoy } from "@/components/simulator/game-boy";
import styles from "./game-boy.module.css";
import { SavesPanel } from "@/components/simulator/saves-panel";

/**
 * One Game Boy session: the device on the left, the session card on the
 * right, and the file input that asks for the original program when this
 * device has the progress but not the bytes.
 *
 * `owner` is fixed for the life of the component — the loader keys on it —
 * so the engine, the lock and the sync below are all set up once against
 * one account and one hash. The program comes from the session provider
 * when the library just opened it, from the device store when it was kept
 * from an earlier visit, or from the catalogue for a built-in; only when
 * all three come up empty does the screen ask for the file.
 */
export default function Player({
  owner,
  contentHash,
  builtin,
}: {
  owner: string;
  contentHash: string;
  builtin: Builtin | null;
}) {
  const { program, setProgram, storageError } = useSimulatorSession();
  const page = useRef<HTMLDivElement>(null);
  // The page is fixed over the dashboard chrome, so the chrome underneath is
  // made inert while it is up: it must not take focus or be read out from
  // behind the game.
  useEffect(() => {
    const main = page.current?.closest("main");
    const siblings = [...(main?.parentElement?.children ?? [])].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== main,
    );
    const previous = siblings.map((element) => element.inert);
    siblings.forEach((element) => {
      element.inert = true;
    });
    return () =>
      siblings.forEach((element, index) => {
        element.inert = previous[index];
      });
  }, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const selected = program?.contentHash === contentHash ? program : null;
  const s = useSimulator(owner, contentHash, builtin, selected, canvas);
  const [checkedHash, setCheckedHash] = useState("");
  const setError = s.setError;
  useEffect(() => {
    if (selected || builtin) return;
    let cancelled = false;
    void readProgram(owner, contentHash)
      .then(async (cached) => {
        if (!cancelled && cached) await setProgram(cached);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Could not read the game stored on this device. Select the original file to continue.",
          );
      })
      .finally(() => {
        if (!cancelled) setCheckedHash(contentHash);
      });
    return () => {
      cancelled = true;
    };
  }, [owner, contentHash, selected, builtin, setProgram, setError]);
  const file = useOriginalFilePicker({
    contentHash,
    open: openProgram,
    mismatch:
      "This is a different file. Select the original file for this progress.",
    onOpen: async (p) => {
      await setProgram(p);
      s.setError("");
    },
    onError: s.setError,
  });
  const checkingFile = !selected && !builtin && checkedHash !== contentHash;
  const canStart = !!(selected || builtin);
  const title =
    builtin?.label ??
    s.record?.label ??
    selected?.label ??
    "Imported simulation";
  return (
    <div ref={page} className={styles.page}>
      <div className={styles.back}>
        <ButtonLink variant="ghost" href="/dashboard/learning-simulator">
          <ArrowLeftIcon /> Back
        </ButtonLink>
      </div>
      {(s.error || storageError) && (
        <Alert className={styles.alert}>{s.error || storageError}</Alert>
      )}
      {s.status.cloud === "conflict" && (
        <div
          className={cn(
            styles.alert,
            "flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/50 bg-amber-500/5 p-4",
          )}
        >
          <p className="flex-1 text-sm">
            Another session saved different progress. Choose which version to
            keep; both are preserved until you decide.
          </p>
          <Button disabled={s.busy} onClick={() => void s.choose("local")}>
            Use this device
          </Button>
          <Button
            variant="outline"
            disabled={s.busy}
            onClick={() => void s.choose("cloud")}
          >
            Use cloud
          </Button>
        </div>
      )}
      {s.status.cloud === "deleted" && (
        <Alert className="border-border text-foreground">
          This cloud entry was deleted. Local progress is preserved for export.
          Return to the library and delete its local entry before starting
          fresh.
        </Alert>
      )}
      <div className={styles.layout}>
        <div className={styles.console}>
          <GameBoy
            enabled={s.loaded && s.running && !s.busy}
            powered={s.running}
            input={s.input}
            focus={s.focus}
            powerDisabled={!s.ready || s.busy || checkingFile}
            power={() =>
              s.loaded ? s.toggle() : canStart ? void s.start() : file.open()
            }
            volume={s.settings.volume}
            setVolume={(volume) => s.updateSettings({ ...s.settings, volume })}
          >
            <canvas
              ref={canvas}
              width={160}
              height={144}
              tabIndex={0}
              aria-label="Game screen. Arrow keys move, X is A, Z is B, Enter starts, right Shift selects."
            />
            {/* The words on the screen are the device's own, set the way a
                Game Boy prints them, which is why they are not sentence case. */}
            {!s.loaded ? (
              <div className={styles.screenOverlay}>
                <p>
                  {checkingFile
                    ? "Loading your game…"
                    : canStart
                      ? "Ready when you are."
                      : "Insert your original game file to continue."}
                </p>
                <button
                  disabled={!s.ready || s.busy || checkingFile}
                  onClick={() => (canStart ? void s.start() : file.open())}
                >
                  {s.busy || checkingFile ? (
                    <Spinner />
                  ) : canStart ? (
                    "POWER ON"
                  ) : (
                    "INSERT GAME"
                  )}
                </button>
              </div>
            ) : !s.running ? (
              <div className={styles.screenOverlay}>
                <p>PAUSED</p>
                <button
                  disabled={s.busy}
                  onClick={() => {
                    s.toggle();
                    canvas.current?.focus();
                  }}
                >
                  RESUME
                </button>
              </div>
            ) : null}
          </GameBoy>
        </div>
        <aside className={styles.saves} aria-label="Game saves and session">
          <div className="rounded-2xl border border-border bg-background p-5">
            <h1 className={styles.sessionTitle}>{title}</h1>
            <div className={styles.sessionMeta}>
              <SaveStatus status={s.status} />
            </div>
            <div className={styles.actions}>
              <Button
                size="sm"
                variant="outline"
                disabled={!s.loaded || s.busy}
                onClick={() => void s.save()}
              >
                Save now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!s.loaded || s.busy}
                onClick={() => {
                  s.toggle();
                  canvas.current?.focus();
                }}
              >
                {s.running ? <PauseIcon /> : <PlayIcon />}
                {s.running ? "Pause" : "Resume"}
              </Button>
            </div>
            <SessionSection title="Saved progress">
              <SavesPanel
                record={s.record}
                disabled={!s.loaded || s.busy}
                save={(slot) => void s.save(slot)}
                restore={(slot) => void s.restore(slot)}
                onError={s.setError}
                importSave={(p) => {
                  if (window.confirm("Restore imported progress?"))
                    void s.importSave(p);
                }}
              />
            </SessionSection>
            <SessionSection title="Controls & session">
              <p className={styles.hints}>
                <kbd>↑ ↓ ← →</kbd> Move · <kbd>X</kbd> A · <kbd>Z</kbd> B<br />
                <kbd>Enter</kbd> Start · <kbd>Right Shift</kbd> Select
                <br />
                Click the screen for keyboard or controller play. You can also
                press the buttons directly.
              </p>
              <p className={styles.hints}>
                Local autosave every 10 seconds. Cloud sync every minute.
              </p>
              <Button
                className="mt-4"
                size="sm"
                variant="outline"
                disabled={!s.loaded || s.busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Restart this game? Current progress will be saved first.",
                    )
                  )
                    void s.restart();
                }}
              >
                Restart game
              </Button>
            </SessionSection>
          </div>
        </aside>
      </div>
      <HiddenFileInput
        picker={file}
        accept=".gb,.gbc"
        aria-label="Select original simulation file"
      />
    </div>
  );
}

/** A collapsed section of the session card, opened by its heading. */
function SessionSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className={styles.details}>
      <button
        type="button"
        className={styles.sectionTrigger}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRightIcon aria-hidden="true" />
        {title}
      </button>
      <Reveal id={id} open={open} contentClassName={styles.sectionContent}>
        {children}
      </Reveal>
    </section>
  );
}
