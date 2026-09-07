"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CenteredSpinner, Spinner } from "@/components/ui/spinner";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  PauseIcon,
} from "@heroicons/react/24/outline";
import { Button, ButtonLink } from "@/components/ui/button";
import type { Builtin } from "@/lib/simulator/types";
import { readProgram } from "@/lib/simulator/local-store";
import { openProgram } from "@/lib/simulator/files";
import { useSimulator } from "@/lib/simulator/use-simulator";
import { useSimulatorSession } from "./session-provider";
import { SaveStatus } from "./save-status";
import { GameBoy } from "./game-boy";
import styles from "./game-boy.module.css";
import { SavesPanel } from "./saves-panel";
export default function Player(props: {
  contentHash: string;
  builtin: Builtin | null;
}) {
  const { userId } = useAuth(),
    { isAuthenticated } = useConvexAuth();
  if (!userId || !isAuthenticated)
    return <CenteredSpinner />;
  return (
    <PlayerSession
      key={`${userId}:${props.contentHash}`}
      owner={userId}
      {...props}
    />
  );
}
function PlayerSession({
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
  useEffect(() => {
    const main = page.current?.closest("main");
    const siblings = [...(main?.parentElement?.children ?? [])]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== main);
    const previous = siblings.map(element => element.inert);
    siblings.forEach(element => { element.inert = true; });
    return () => siblings.forEach((element, index) => { element.inert = previous[index]; });
  }, []);
  const canvas = useRef<HTMLCanvasElement>(null),
    file = useRef<HTMLInputElement>(null);
  const selected = program?.contentHash === contentHash ? program : null;
  const s = useSimulator(owner, contentHash, builtin, selected, canvas);
  const [checkedHash, setCheckedHash] = useState("");
  const setError = s.setError;
  useEffect(() => {
    if (selected || builtin) return;
    let cancelled = false;
    void readProgram(owner, contentHash).then(async (cached) => {
      if (!cancelled && cached) await setProgram(cached);
    }).catch(() => {
      if (!cancelled) setError("Could not read the game stored on this device. Select the original file to continue.");
    }).finally(() => { if (!cancelled) setCheckedHash(contentHash); });
    return () => { cancelled = true; };
  }, [owner, contentHash, selected, builtin, setProgram, setError]);
  const checkingFile = !selected && !builtin && checkedHash !== contentHash;
  const canStart = !!(selected || builtin);
  const title = builtin?.label ?? s.record?.label ?? selected?.label ?? "Imported simulation";
  return (
    <div ref={page} className={styles.page}>
      <div className={styles.back}>
        <ButtonLink variant="ghost" href="/dashboard/learning-simulator">
          <ArrowLeftIcon /> Back
        </ButtonLink>
      </div>
      {(s.error || storageError) && (
        <p
          role="alert"
          className={`${styles.alert} rounded-xl border border-destructive/30 p-4 text-sm text-destructive`}
        >
          {s.error || storageError}
        </p>
      )}
      {s.status.cloud === "conflict" && (
        <div className={`${styles.alert} flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/50 bg-amber-500/5 p-4`}>
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
        <p role="alert" className="rounded-xl border border-border p-4 text-sm">
          This cloud entry was deleted. Local progress is preserved for export.
          Return to the library and delete its local entry before starting
          fresh.
        </p>
      )}
      <div className={styles.layout}>
        <div className={styles.console}>
          <GameBoy enabled={s.loaded && s.running && !s.busy} powered={s.running}
            input={s.input} focus={s.focus} powerDisabled={!s.ready || s.busy || checkingFile}
            power={() => s.loaded ? s.toggle() : canStart ? void s.start() : file.current?.click()}
            volume={s.settings.volume}
            setVolume={(volume) => s.updateSettings({ ...s.settings, volume })}>
            <canvas ref={canvas} width={160} height={144} tabIndex={0}
              aria-label="Game screen. Arrow keys move, X is A, Z is B, Enter starts, right Shift selects." />
            {!s.loaded ? (
              <div className={styles.screenOverlay}>
                <p>{checkingFile ? "Loading your game…" : canStart ? "Ready when you are." : "Insert your original game file to continue."}</p>
                <button disabled={!s.ready || s.busy || checkingFile}
                  onClick={() => canStart ? void s.start() : file.current?.click()}>
                  {s.busy || checkingFile ? <Spinner /> : canStart ? "POWER ON" : "INSERT GAME"}
                </button>
              </div>
            ) : !s.running ? (
              <div className={styles.screenOverlay}>
                <p>PAUSED</p>
                <button disabled={s.busy} onClick={() => { s.toggle(); canvas.current?.focus(); }}>RESUME</button>
              </div>
            ) : null}
          </GameBoy>
        </div>
        <aside className={styles.saves} aria-label="Game saves and session">
          <div className="rounded-2xl border border-border bg-background p-5">
            <h1 className={styles.sessionTitle}>{title}</h1>
            <div className={styles.sessionMeta}><SaveStatus status={s.status} /></div>
            <div className={styles.actions}>
              <Button size="sm" variant="outline" disabled={!s.loaded || s.busy} onClick={() => void s.save()}>Save now</Button>
              <Button size="sm" variant="ghost" disabled={!s.loaded || s.busy} onClick={() => { s.toggle(); canvas.current?.focus(); }}>
                {s.running ? <PauseIcon /> : <PlayIcon />}{s.running ? "Pause" : "Resume"}
              </Button>
            </div>
            <SessionSection title="Saved progress">
              <SavesPanel record={s.record} disabled={!s.loaded || s.busy}
                save={(slot) => void s.save(slot)} restore={(slot) => void s.restore(slot)} onError={s.setError}
                importSave={(p) => { if (window.confirm("Restore imported progress?")) void s.importSave(p); }} />
            </SessionSection>
            <SessionSection title="Controls & session">
              <p className={styles.hints}>
                <kbd>↑ ↓ ← →</kbd> Move · <kbd>X</kbd> A · <kbd>Z</kbd> B<br />
                <kbd>Enter</kbd> Start · <kbd>Right Shift</kbd> Select<br />
                Click the screen for keyboard or controller play. You can also press the buttons directly.
              </p>
              <p className={styles.hints}>Local autosave every 10 seconds. Cloud sync every minute.</p>
              <Button className="mt-4" size="sm" variant="outline" disabled={!s.loaded || s.busy}
                onClick={() => { if (window.confirm("Restart this game? Current progress will be saved first.")) void s.restart(); }}>Restart game</Button>
            </SessionSection>
          </div>
        </aside>
      </div>
      <input
        ref={file}
        type="file"
        accept=".gb,.gbc"
        className="hidden"
        aria-label="Select original simulation file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const p = await openProgram(f);
            if (p.contentHash !== contentHash)
              throw new Error(
                "This is a different file. Select the original file for this progress.",
              );
            await setProgram(p);
            s.setError("");
          } catch (err) {
            s.setError(
              err instanceof Error ? err.message : "Could not open file.",
            );
          }
        }}
      />
    </div>
  );
}

function SessionSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className={styles.details}>
      <button type="button" className={styles.sectionTrigger} aria-expanded={open}
        aria-controls={id} onClick={() => setOpen(value => !value)}>
        <ChevronRightIcon aria-hidden="true" />{title}
      </button>
      <div id={id} className={styles.sectionPanel} data-open={open} inert={!open}>
        <div className={styles.sectionContent}>{children}</div>
      </div>
    </section>
  );
}
