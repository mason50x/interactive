"use client";
import { useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import {
  ArrowLeftIcon,
  ArrowsPointingOutIcon,
  PlayIcon,
  PauseIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import { Button, ButtonLink } from "@/components/ui/button";
import type { Builtin, Input } from "@/lib/simulator/types";
import { openProgram } from "@/lib/simulator/files";
import { useSimulator } from "@/lib/simulator/use-simulator";
import { useSimulatorSession } from "./session-provider";
import { SaveStatus } from "./save-status";
import { TouchControls } from "./controls";
import { SavesPanel } from "./saves-panel";
const keys: Record<string, Input> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyX: "A",
  KeyZ: "B",
  Enter: "start",
  ShiftRight: "select",
};
export default function Player(props: {
  contentHash: string;
  builtin: Builtin | null;
}) {
  const { userId } = useAuth(),
    { isAuthenticated } = useConvexAuth();
  if (!userId || !isAuthenticated)
    return (
      <p className="p-8 text-muted-foreground">Connecting to your account…</p>
    );
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
  const { program, setProgram } = useSimulatorSession();
  const canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    file = useRef<HTMLInputElement>(null);
  const selected = program?.contentHash === contentHash ? program : null;
  const s = useSimulator(owner, contentHash, builtin, selected, canvas);
  const [showSaves, setShowSaves] = useState(false),
    [expanded, setExpanded] = useState(false);
  const canStart = !!(selected || builtin);
  const title = builtin?.label ?? s.record?.label ?? "Imported simulation";
  return (
    <div
      ref={stage}
      className={`${expanded ? "fixed inset-0 z-50 max-w-none overflow-auto bg-surface" : ""} mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5 p-5 sm:p-8 [&:fullscreen]:max-w-none [&:fullscreen]:overflow-y-auto [&:fullscreen]:bg-surface`}
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ButtonLink
            variant="ghost"
            size="icon"
            aria-label="Back to Learning Simulator"
            href="/dashboard/learning-simulator"
          >
            <ArrowLeftIcon />
          </ButtonLink>
          <div>
            <p className="text-xs text-muted-foreground">Learning Simulator</p>
            <h1 className="mt-1 text-xl font-semibold">{title}</h1>
          </div>
        </div>
        <SaveStatus status={s.status} />
      </header>
      {s.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          {s.error}
        </p>
      )}
      {s.status.cloud === "conflict" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/50 bg-amber-500/5 p-4">
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
      <div className="relative flex flex-col rounded-2xl border border-border bg-[#131e1c] p-4 sm:p-6">
        <div className="relative mx-auto flex w-full flex-1 items-center justify-center py-3">
          <canvas
            ref={canvas}
            width={160}
            height={144}
            tabIndex={0}
            aria-label="Simulation screen. Arrow keys move, X is A, Z is B, Enter starts, right Shift selects."
            className="aspect-[10/9] w-full max-w-[480px] rounded-sm bg-[#c4d6a4] outline-none [image-rendering:pixelated] focus-visible:ring-2 focus-visible:ring-[#b5d19c] focus-visible:ring-offset-4 focus-visible:ring-offset-[#131e1c]"
            onFocus={() => s.focus(true)}
            onBlur={() => s.focus(false)}
            onKeyDown={(e) => {
              if (e.metaKey || e.ctrlKey || e.altKey) return;
              const key = keys[e.code];
              if (key) {
                e.preventDefault();
                s.input(key, true);
              }
            }}
            onKeyUp={(e) => {
              const key = keys[e.code];
              if (key) {
                e.preventDefault();
                s.input(key, false);
              }
            }}
          />
          {!s.loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="max-w-xs space-y-4 rounded-xl bg-[#131e1c]/95 p-6 text-center text-white">
                <p className="text-sm leading-6">
                  {canStart
                    ? "Your progress is ready when you are."
                    : "Select the original file to resume your saved progress."}
                </p>
                <Button
                  disabled={!s.ready || s.busy}
                  onClick={() =>
                    canStart ? void s.start() : file.current?.click()
                  }
                >
                  {canStart ? <PlayIcon /> : <ArrowUpTrayIcon />}
                  {s.busy
                    ? "Starting…"
                    : canStart
                      ? "Start simulation"
                      : "Select original file"}
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="inverted"
            disabled={!s.loaded || s.busy}
            onClick={s.toggle}
          >
            {s.running ? <PauseIcon /> : <PlayIcon />}
            {s.running ? "Pause" : "Resume"}
          </Button>
          <Button
            variant="inverted-outline"
            disabled={!s.loaded}
            onClick={() => void s.save()}
          >
            Save now
          </Button>
          <Button
            variant="inverted-outline"
            disabled={!s.loaded || s.busy}
            onClick={() => {
              if (
                window.confirm(
                  "Restart this simulation? Current progress will be saved first.",
                )
              )
                void s.restart();
            }}
          >
            Restart
          </Button>
          <Button
            variant="inverted-outline"
            onClick={() => setShowSaves(!showSaves)}
            aria-expanded={showSaves}
          >
            Saves
          </Button>
          <Button
            variant="inverted-outline"
            size="icon"
            aria-label={expanded ? "Exit expanded view" : "Expand simulator"}
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else if (document.fullscreenEnabled)
                  await stage.current?.requestFullscreen();
                else setExpanded(!expanded);
              } catch {
                setExpanded(!expanded);
              }
            }}
          >
            <ArrowsPointingOutIcon />
          </Button>
          <label className="ml-2 flex items-center gap-2 text-xs text-white/80">
            Volume
            <input
              aria-label="Volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={s.settings.volume}
              onChange={(e) =>
                s.updateSettings({
                  ...s.settings,
                  volume: Number(e.target.value),
                })
              }
              className="w-20 accent-[#c4d6a4]"
            />
          </label>
        </div>
        <p className="mt-4 text-center text-xs leading-5 text-white/60">
          Arrows to move · X / Z for A / B · Enter to start · Right Shift to
          select
          <br />
          Click the screen to use your keyboard or controller.
        </p>
      </div>
      {s.settings.touch && (
        <TouchControls input={s.input} disabled={!s.loaded || !s.running} />
      )}
      <div className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={s.settings.touch}
            onChange={(e) =>
              s.updateSettings({ ...s.settings, touch: e.target.checked })
            }
          />
          Touch controls
        </label>
        <span>Local autosave every 10 seconds · Cloud sync every minute</span>
      </div>
      {showSaves && (
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
      )}
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
            setProgram(p);
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
