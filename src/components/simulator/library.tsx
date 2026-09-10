"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";
import type { LocalEntry } from "@/lib/simulator/types";
import { openProgram } from "@/lib/simulator/files";
import {
  clearLocal,
  listLocal,
  removeLocal,
} from "@/lib/simulator/local-store";
import { useSimulatorSession } from "./session-provider";
import { useFilePicker } from "./file-picker";
import { ClearAllButton } from "./clear-all-button";
import { ImportPanel, ProgressSection } from "./library-parts";
import {
  EntryList,
  EntryRow,
  LibraryEmpty,
  formatSavedAt,
} from "./library-entries";
import { LibraryShell } from "./library-shell";
import { PixelController } from "./pixel-controller";

const ROOT = "/dashboard/learning-simulator";

/**
 * The Game Boy library: every program this account has progress for, from
 * the account's entries and from this device's store, merged by content
 * hash so a game saved in both places is one row.
 *
 * The account is the source of truth for names and the cloud save; the
 * device store holds the program bytes and the local autosaves, and a row
 * that exists only there has no entry to rename. Opening a file hashes it,
 * hands it to the session so the player can start without asking again,
 * and navigates to its hash.
 */
export function GameBoyLibrary() {
  const { userId } = useAuth();
  const router = useRouter();
  const { setProgram } = useSimulatorSession();
  const entries = useAuthedQuery(api.simulator.library.list, {});
  const rename = useMutation(api.simulator.library.rename);
  const remove = useMutation(api.simulator.library.remove);
  const [local, setLocal] = useState<LocalEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let alive = true;
    if (userId)
      void listLocal(userId)
        .then((rows) => {
          if (alive) setLocal(rows);
        })
        .catch(() => {
          if (alive)
            setError(
              "Local storage is unavailable. Cloud progress can still be used.",
            );
        });
    return () => {
      alive = false;
    };
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
  ]
    .sort((a, b) => b.at - a.at)
    .filter((e) => e.label.toLowerCase().includes(search.toLowerCase()));
  const picker = useFilePicker((file) => {
    void (async () => {
      setBusy(true);
      setError("");
      try {
        const p = await openProgram(file);
        await setProgram(p);
        router.push(`${ROOT}/${p.contentHash}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to open file.");
      } finally {
        setBusy(false);
      }
    })();
  });
  return (
    <LibraryShell
      picker={picker}
      accept=".gb,.gbc"
      inputLabel="Open simulation file"
      busy={busy}
      error={error}
    >
      <ImportPanel
        heading="Bring your own file"
        description="Drop a .gb or .gbc file here, or choose one from your device."
        busy={busy}
        choose={picker.open}
      />
      <ProgressSection
        search={search}
        setSearch={setSearch}
        actions={
          <ClearAllButton
            label="Clear all progress"
            confirmLabel="Confirm clear all progress"
            title="Clear all saved progress from this device and your account."
            disabled={!userId || entries === undefined}
            onConfirm={async () => {
              if (!userId) return;
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
              }
            }}
          />
        }
      >
        {rows.length === 0 ? (
          <LibraryEmpty search={search} art={<PixelController />}>
            Saved simulations will appear here. Open a file to begin.
          </LibraryEmpty>
        ) : (
          <EntryList>
            {rows.map((row) => (
              <EntryRow
                key={row.hash}
                title={row.label}
                subtitle={formatSavedAt(row.at)}
                href={`${ROOT}/${row.hash}`}
                action="Resume"
                deleteMessage="Delete this simulation’s saved progress from this device and your account?"
                onRename={
                  row.id
                    ? (label) => {
                        if (row.id)
                          void rename({ entryId: row.id, label }).catch((e) =>
                            setError(e.message),
                          );
                      }
                    : undefined
                }
                onDelete={async () => {
                  if (!userId) return;
                  try {
                    if (row.id) await remove({ entryId: row.id });
                    await removeLocal(userId, row.hash);
                    await setProgram(null);
                    setLocal(await listLocal(userId));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Delete failed.");
                  }
                }}
              />
            ))}
          </EntryList>
        )}
      </ProgressSection>
    </LibraryShell>
  );
}
