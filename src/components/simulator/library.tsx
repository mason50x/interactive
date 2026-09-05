"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import {
  ArrowUpTrayIcon,
  CpuChipIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { TrashIcon } from "@heroicons/react/24/solid";
import { api } from "../../../convex/_generated/api";
import { Button, ButtonLink } from "@/components/ui/button";
import type { Builtin, LocalEntry } from "@/lib/simulator/types";
import { openProgram } from "@/lib/simulator/files";
import {
  clearLocal,
  listLocal,
  removeLocal,
} from "@/lib/simulator/local-store";
import { useSimulatorSession } from "./session-provider";
const ROOT = "/dashboard/learning-simulator";
export function SimulatorLibrary({ builtins }: { builtins: Builtin[] }) {
  const { userId } = useAuth(),
    { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const { setProgram } = useSimulatorSession();
  const file = useRef<HTMLInputElement>(null);
  const entries = useQuery(
    api.simulator.library.list,
    isAuthenticated ? {} : "skip",
  );
  const rename = useMutation(api.simulator.library.rename),
    remove = useMutation(api.simulator.library.remove);
  const [local, setLocal] = useState<LocalEntry[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmClear, setConfirmClear] = useState(false),
    [clearing, setClearing] = useState(false),
    [search, setSearch] = useState("");
  useEffect(() => {
    if (userId)
      void listLocal(userId)
        .then(setLocal)
        .catch(() =>
          setError(
            "Local storage is unavailable. Cloud progress can still be used.",
          ),
        );
  }, [userId]);
  const rows = [
    ...(entries ?? []).map((e) => ({
      hash: e.contentHash,
      label: e.label,
      at: e.latestSavedAt ?? e.lastOpenedAt,
      id: e._id,
    })),
    ...local
      .filter((l) => !entries?.some((e) => e.contentHash === l.contentHash))
      .map((l) => ({
        hash: l.contentHash,
        label: l.label,
        at: l.updatedAt,
        id: undefined,
      })),
  ].filter((e) => e.label.toLowerCase().includes(search.toLowerCase()));
  async function select(f: File) {
    setBusy(true);
    setError("");
    try {
      const p = await openProgram(f);
      setProgram(p);
      router.push(`${ROOT}/${p.contentHash}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open file.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-10 px-6 py-8 sm:px-8 lg:px-10"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) void select(e.dataTransfer.files[0]);
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-display text-display-title text-3xl sm:text-4xl">
            Learning Simulator
          </h1>
        </div>
        <Button size="lg" disabled={busy} onClick={() => file.current?.click()}>
          {busy ? "Opening…" : "Open file"}
        </Button>
      </header>
      <input
        ref={file}
        type="file"
        accept=".gb,.gbc"
        className="hidden"
        aria-label="Open simulation file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void select(f);
        }}
      />
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <section className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        {builtins.map((b) => (
          <div
            key={b.id}
            className="overflow-hidden rounded-2xl border border-border bg-background"
          >
            <div
              className="relative flex h-52 items-center justify-center overflow-hidden bg-[#182a26]"
              aria-hidden="true"
            >
              <div
                className="absolute inset-0 opacity-25"
                style={{
                  backgroundImage:
                    "radial-gradient(#bdddb7 1px, transparent 1px)",
                  backgroundSize: "16px 16px",
                }}
              />
              <div className="grid size-24 place-items-center rounded-[1.7rem] border border-[#b9dcaa]/30 bg-[#a9cb9a]/10 text-[#c4e0ad]">
                <CpuChipIcon className="size-12" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-5 p-6">
              <div>
                <h2 className="text-lg font-semibold">{b.label}</h2>
                <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
                  {b.description}
                </p>
              </div>
              <ButtonLink
                href={`${ROOT}/${b.contentHash}`}
                size="icon-lg"
                aria-label={`Open ${b.label}`}
              >
                <ArrowRightIcon />
              </ButtonLink>
            </div>
          </div>
        ))}
        <div className="flex flex-col items-start justify-center rounded-2xl border border-dashed border-border p-8">
          <ArrowUpTrayIcon className="mb-5 size-7 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Bring your own file</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Drop a .gb or .gbc file here, or choose one from your device.
          </p>
          <Button
            className="mt-6"
            variant="outline"
            onClick={() => file.current?.click()}
            disabled={busy}
          >
            Choose file
          </Button>
        </div>
      </section>
      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Your progress</h2>
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              aria-label={
                confirmClear
                  ? "Confirm clear all progress"
                  : "Clear all progress"
              }
              title="Clear all saved progress from this device and your account."
              disabled={clearing || !userId || entries === undefined}
              onBlur={() => setConfirmClear(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setConfirmClear(false);
              }}
              onClick={async () => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  return;
                }
                if (!userId || clearing) return;
                setClearing(true);
                try {
                  for (const entry of entries ?? []) {
                    await remove({ entryId: entry._id });
                  }
                  await clearLocal(userId);
                  setLocal([]);
                } catch {
                  setError(
                    "Could not clear all progress. Please try again to finish clearing the remaining saves.",
                  );
                } finally {
                  setClearing(false);
                  setConfirmClear(false);
                }
              }}
              className={`relative h-9 gap-0 overflow-hidden px-2.5 transition-[width,color,background-color] duration-300 ease-in-out motion-reduce:transition-none ${confirmClear ? "w-28 text-destructive" : "w-9 text-muted-foreground"}`}
            >
              <TrashIcon className="absolute left-2.5 size-4" />
              <span
                aria-hidden="true"
                className={`ml-6 whitespace-nowrap transition-[opacity,transform] duration-300 ease-in-out motion-reduce:transition-none ${confirmClear ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"}`}
              >
                Confirm?
              </span>
            </Button>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a simulation"
              aria-label="Find a simulation"
              className="h-9 w-full max-w-64 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-border px-6 py-10 text-sm text-muted-foreground">
            {search
              ? "No matching simulations."
              : "Saved simulations will appear here. Start Pixel Field or open a file to begin."}
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-background">
            {rows.map((row) => (
              <div
                key={row.hash}
                className="flex flex-wrap items-center gap-3 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(row.at).toLocaleString(undefined, {
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {!builtins.some((b) => b.contentHash === row.hash)
                      ? " · Select original file to resume"
                      : ""}
                  </p>
                </div>
                <ButtonLink variant="outline" href={`${ROOT}/${row.hash}`}>
                  Resume
                </ButtonLink>
                {row.id && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const name = window.prompt("Simulation label", row.label);
                      if (name && row.id)
                        void rename({ entryId: row.id, label: name }).catch(
                          (e) => setError(e.message),
                        );
                    }}
                  >
                    Rename
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (
                      !userId ||
                      !window.confirm(
                        "Delete this simulation’s saved progress from this device and your account?",
                      )
                    )
                      return;
                    try {
                      if (row.id) await remove({ entryId: row.id });
                      await removeLocal(userId, row.hash);
                      setLocal(await listLocal(userId));
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Delete failed.",
                      );
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
