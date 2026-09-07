"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useConvex } from "convex/react";
import type {
  Builtin,
  Input,
  LocalEntry,
  Program,
  Slot,
  SyncStatus,
  WriteSlot,
} from "./types";
import { SimulatorEngine } from "./engine";
import { ProgressSync } from "./sync";
import { makeProgress, validateProgress } from "./progress";
import { identify } from "./files";
import { acquirePlayerLock } from "./lock";
import { readSettings, saveSettings, defaultSettings } from "./settings";
export function useSimulator(
  owner: string,
  hash: string,
  builtin: Builtin | null,
  program: Program | null,
  canvas: RefObject<HTMLCanvasElement | null>,
) {
  const client = useConvex(),
    engine = useRef<SimulatorEngine | null>(null),
    sync = useRef<ProgressSync | null>(null),
    alive = useRef(false),
    starting = useRef(false),
    capturedFrame = useRef(-1),
    settingsRef = useRef(defaultSettings);
  const [ready, setReady] = useState(false),
    [running, setRunning] = useState(false),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [record, setRecord] = useState<LocalEntry | null>(null),
    [status, setStatus] = useState<SyncStatus>({
      local: "ready",
      cloud: "ready",
    }),
    [settings, setSettings] = useState(defaultSettings);
  useEffect(() => {
    alive.current = true;
    queueMicrotask(() => setReady(false));
    let cancelled = false,
      release: (() => void) | null = null;
    capturedFrame.current = -1;
    let lastSave = 0;
    const manager = new ProgressSync(
      owner,
      hash,
      program?.mode ?? (builtin?.mode === "color" ? "color" : "mono"),
      client,
      () => {
        if (!cancelled) {
          setRecord(structuredClone(manager.record));
          setStatus({ ...manager.status });
        }
      },
      program?.label,
    );
    sync.current = manager;
    const stored = readSettings();
    settingsRef.current = stored;
    queueMicrotask(() => {
      if (!cancelled) setSettings(stored);
    });
    void (async () => {
      release = await acquirePlayerLock(`50x-simulator:${owner}:${hash}`);
      if (cancelled) {
        release?.();
        return;
      }
      if (!release) {
        setError(
          navigator.locks
            ? "This simulation is open in another tab. Close it there and reload this page."
            : "This browser cannot safely coordinate local saves. Open this page in a browser with Web Locks support.",
        );
        return;
      }
      await manager.init();
      if (!cancelled) {
        setRecord(structuredClone(manager.record));
        setReady(true);
      }
    })();
    const capture = () => {
      const e = engine.current;
      if (!e || e.frames === capturedFrame.current) return undefined;
      capturedFrame.current = e.frames;
      lastSave = Date.now();
      try {
        return manager.capture(
          makeProgress(hash, manager.record.mode, e.capture()),
        );
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Save failed.");
      }
    };
    const timer = setInterval(() => {
      const e = engine.current;
      if (
        e?.running &&
        (Date.now() - lastSave >= 10000 ||
          (e.batteryDirty && Date.now() - lastSave >= 2000))
      )
        capture();
      void manager.flush();
    }, 1000);
    const hidden = () => {
      if (document.hidden && engine.current) {
        engine.current.pause();
        setRunning(false);
        capture();
        void manager.flush(true);
      }
    };
    const online = () => void manager.flush(true);
    const blur = () => {
      if (engine.current) {
        engine.current.gamepadEnabled = false;
        engine.current.release();
      }
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("online", online);
    window.addEventListener("blur", blur);
    window.addEventListener("gamepaddisconnected", blur);
    return () => {
      cancelled = true;
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("online", online);
      window.removeEventListener("blur", blur);
      window.removeEventListener("gamepaddisconnected", blur);
      const finalSave = capture();
      manager.stop();
      engine.current?.dispose();
      engine.current = null;
      sync.current = null;
      if (finalSave) void finalSave.finally(() => release?.());
      else release?.();
    };
  }, [owner, hash, client, builtin?.mode, program?.mode, program?.label]);
  async function start() {
    if (!ready || starting.current || !canvas.current || !sync.current) return;
    starting.current = true;
    setBusy(true);
    setError("");
    const audio = new AudioContext();
    void audio.resume();
    try {
      let p = program;
      if (!p && builtin) {
        const response = await fetch(builtin.path);
        if (!response.ok)
          throw new Error("The built-in simulation could not load.");
        p = await identify(await response.arrayBuffer());
      }
      if (!p || p.contentHash !== hash)
        throw new Error("Select the matching original file to continue.");
      if (!alive.current) {
        void audio.close();
        return;
      }
      const e = await SimulatorEngine.create(
        canvas.current,
        p.bytes,
        settingsRef.current.volume,
        audio,
      );
      if (!alive.current) {
        e.dispose();
        return;
      }
      e.onError = (err) => {
        if (alive.current) {
          setError(err.message);
          setRunning(false);
        }
      };
      engine.current = e;
      if (sync.current) sync.current.record.mode = p.mode;
      const saved = sync.current?.record.saves.auto;
      if (saved) e.restore(validateProgress(saved, hash).checkpoint);
      e.resume();
      setLoaded(true);
      setRunning(true);
      canvas.current?.focus();
    } catch (err) {
      void audio.close().catch(() => {});
      engine.current?.dispose();
      engine.current = null;
      setError(err instanceof Error ? err.message : "Unable to start.");
    } finally {
      starting.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function save(slot: WriteSlot = "auto", cloud = true) {
    const e = engine.current,
      m = sync.current;
    if (!e || !m) return;
    try {
      if (slot !== "auto" || capturedFrame.current !== e.frames) {
        if (slot === "auto") capturedFrame.current = e.frames;
        await m.capture(makeProgress(hash, m.record.mode, e.capture()), slot);
      }
      if (cloud) await m.flush(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }
  function toggle() {
    const e = engine.current;
    if (!e) return;
    if (e.running) {
      e.pause();
      setRunning(false);
      void save();
    } else {
      e.resume();
      setRunning(true);
    }
  }
  async function restore(slot: Slot) {
    const m = sync.current,
      e = engine.current;
    if (!m || !e) return;
    e.pause();
    setRunning(false);
    try {
      const p = await m.restore(slot);
      e.restore(p.checkpoint);
      capturedFrame.current = e.frames;
      await m.flush(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    }
  }
  async function choose(which: "local" | "cloud") {
    const m = sync.current;
    if (!m) return;
    engine.current?.pause();
    setRunning(false);
    setBusy(true);
    try {
      if (which === "local") await m.chooseLocal();
      else {
        await m.chooseCloud();
        const p = m.record.saves.auto;
        if (p) engine.current?.restore(p.checkpoint);
        else engine.current?.restart();
        capturedFrame.current = engine.current?.frames ?? -1;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not resolve progress.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function restart() {
    const e = engine.current;
    if (!e) return;
    e.pause();
    setRunning(false);
    await save();
    e.restart();
    e.resume();
    setRunning(true);
  }
  async function importSave(p: import("./types").Progress) {
    const e = engine.current,
      m = sync.current;
    if (!e || !m) return;
    e.pause();
    setRunning(false);
    try {
      await m.capture({ ...p, captureId: crypto.randomUUID() });
      e.restore(p.checkpoint);
      capturedFrame.current = e.frames;
      await m.flush(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    }
  }
  function updateSettings(next: typeof settings) {
    setSettings(next);
    settingsRef.current = next;
    saveSettings(next);
    engine.current?.setVolume(next.volume);
  }
  function input(key: Input, down: boolean) {
    engine.current?.input(key, down);
  }
  function focus(active: boolean) {
    if (engine.current) {
      engine.current.gamepadEnabled = active;
      if (!active) engine.current.release();
    }
  }
  return {
    ready,
    running,
    loaded,
    busy,
    error,
    setError,
    record,
    status,
    settings,
    updateSettings,
    start,
    toggle,
    save,
    restore,
    choose,
    input,
    focus,
    restart,
    importSave,
  };
}
