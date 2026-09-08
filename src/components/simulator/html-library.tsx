"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@heroicons/react/24/outline";
import { api } from "../../../convex/_generated/api";
import { Button, ButtonLink } from "@/components/ui/button";
import { PixelCode } from "./pixel-code";
import { ImportPanel, ProgressSection } from "./library-parts";
import {
  identifyHtml,
  importHtml,
  listHtml,
  openHtml,
  removeHtml,
  renameHtml,
  type HtmlEntry,
  type HtmlProgram,
} from "@/lib/simulator/html-store";
const ROOT = "/dashboard/learning-simulator/html";
export default function HtmlLibrary() {
  const { userId } = useAuth(),
    { isAuthenticated } = useConvexAuth(),
    router = useRouter();
  const cloud = useQuery(
    api.simulator.html.list,
    isAuthenticated ? {} : "skip",
  );
  const remove = useMutation(api.simulator.html.remove),
    rename = useMutation(api.simulator.html.rename);
  const [local, setLocal] = useState<HtmlEntry[]>([]),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmClear, setConfirmClear] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    if (userId)
      void listHtml(userId)
        .then((rows) => {
          if (alive) setLocal(rows);
        })
        .catch(() => {
          if (alive)
            setError(
              "Local storage is unavailable. Allow site storage to retain HTML and progress.",
            );
        });
    return () => {
      alive = false;
    };
  }, [userId]);
  async function open(makeProgram: () => Promise<HtmlProgram>) {
    if (busy || !userId) return;
    setBusy(true);
    setError("");
    try {
      const p = await makeProgram();
      await importHtml(userId, p);
      void navigator.storage?.persist?.().catch(() => {});
      router.push(`${ROOT}/${p.contentHash}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not keep this HTML on your device.",
      );
    } finally {
      setBusy(false);
    }
  }
  const rows = [
    ...local.map((e) => ({ ...e, available: true })),
    ...(cloud ?? [])
      .filter((e) => !local.some((l) => l.contentHash === e.contentHash))
      .map((e) => ({
        contentHash: e.contentHash,
        label: e.label,
        updatedAt: e.lastOpenedAt,
        available: false,
      })),
  ]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((e) => e.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div
      className="space-y-10"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0])
          void open(() => openHtml(e.dataTransfer.files[0]));
      }}
    >
      <input
        ref={picker}
        type="file"
        accept=".html,.htm,text/html"
        className="hidden"
        aria-label="Open HTML file"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void open(() => openHtml(f));
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
      <ImportPanel
        html
        busy={busy || !userId}
        choose={() => picker.current?.click()}
        paste={(code, label) =>
          void open(() =>
            identifyHtml(new TextEncoder().encode(code).buffer, label),
          )
        }
      />
      <ProgressSection
        search={search}
        setSearch={setSearch}
        actions={
          <Button
            variant="ghost"
            disabled={busy || !rows.length}
            aria-label={
              confirmClear ? "Confirm clear HTML library" : "Clear HTML library"
            }
            onBlur={() => setConfirmClear(false)}
            onClick={async () => {
              if (!confirmClear) {
                setConfirmClear(true);
                return;
              }
              if (!userId) return;
              setBusy(true);
              setError("");
              try {
                await removeHtml(userId);
                setLocal([]);
                if (isAuthenticated) await remove({});
              } catch {
                setError(
                  "Device files were cleared where possible. Account metadata could not be cleared; reconnect and retry.",
                );
              } finally {
                setBusy(false);
                setConfirmClear(false);
              }
            }}
          >
            <TrashIcon className="size-4" />
            {confirmClear && "Confirm?"}
          </Button>
        }
      >
        {!rows.length ? (
          <div className="flex flex-col items-center gap-5 rounded-xl border border-border px-6 py-10 text-center text-sm text-muted-foreground">
            {!search && <PixelCode />}
            <p>
              {search
                ? "No matching simulations."
                : "Your HTML simulations will appear here. Open a file or paste code to begin."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-background">
            {rows.map((row) => (
              <div
                key={row.contentHash}
                className="flex flex-wrap items-center gap-3 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.available
                      ? "Kept on this device"
                      : "Original HTML needed on this device"}{" "}
                    · {new Date(row.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <ButtonLink
                  variant="outline"
                  href={`${ROOT}/${row.contentHash}`}
                >
                  {row.available ? "Resume" : "Open"}
                </ButtonLink>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    const label = window.prompt("Simulation name", row.label);
                    if (!label || !userId) return;
                    try {
                      await renameHtml(userId, row.contentHash, label);
                      setLocal(await listHtml(userId));
                      if (isAuthenticated)
                        await rename({ contentHash: row.contentHash, label });
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Could not rename.",
                      );
                    }
                  }}
                >
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !userId ||
                      !window.confirm(
                        "Delete this HTML, its device progress, and its account library entry? Copies on other devices remain.",
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      await removeHtml(userId, row.contentHash);
                      setLocal(await listHtml(userId));
                      if (isAuthenticated)
                        await remove({ contentHash: row.contentHash });
                    } catch {
                      setError(
                        "Account metadata could not be removed. Reconnect and retry; local deletion may have completed.",
                      );
                    } finally {
                      setBusy(false);
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
