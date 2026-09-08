"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@heroicons/react/24/solid";
import { api } from "../../../convex/_generated/api";
import { Button, ButtonLink } from "@/components/ui/button";
import type { LocalEntry } from "@/lib/simulator/types";
import { openProgram } from "@/lib/simulator/files";
import {
  clearLocal,
  listLocal,
  removeLocal,
} from "@/lib/simulator/local-store";
import { useSimulatorSession } from "./session-provider";
import { ImportPanel, ProgressSection } from "./library-parts";
import { PixelController } from "./pixel-controller";
const ROOT = "/dashboard/learning-simulator";
export function GameBoyLibrary() {
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
      await setProgram(p);
      router.push(`${ROOT}/${p.contentHash}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open file.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="space-y-10"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) void select(e.dataTransfer.files[0]);
      }}
    >
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
      <ImportPanel busy={busy} choose={() => file.current?.click()} />
      <ProgressSection
        search={search}
        setSearch={setSearch}
        actions={
          <Button
            variant="ghost"
            aria-label={
              confirmClear ? "Confirm clear all progress" : "Clear all progress"
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
                await setProgram(null);
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
        }
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-border px-6 py-10 text-center text-sm text-muted-foreground">
            {!search && <PixelController />}
            <p>
              {search
                ? "No matching simulations."
                : "Saved simulations will appear here. Open a file to begin."}
            </p>
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
                      await setProgram(null);
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
      </ProgressSection>
    </div>
  );
}
