"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";
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
import { useFilePicker } from "./file-picker";
import { ClearAllButton } from "./clear-all-button";
import { HtmlImportPanel, ProgressSection } from "./library-parts";
import {
  EntryList,
  EntryRow,
  LibraryEmpty,
  formatSavedAt,
} from "./library-entries";
import { LibraryShell } from "./library-shell";
import { PixelCode } from "./pixel-code";

const ROOT = "/dashboard/learning-simulator/html";

/**
 * The HTML library: the self-contained pages this account has opened,
 * merged from this device's store and the account's list of names.
 *
 * The device is the source of truth here, the reverse of the Game Boy
 * library: the HTML itself never leaves the device, and the account keeps
 * only a name against each hash so the list can show what is missing on a
 * second device. A row that is in the account but not on this device says
 * so and opens to a screen that asks for the original file. Pasted code is
 * hashed the same way a chosen file is, so it lands as an ordinary entry.
 */
export default function HtmlLibrary() {
  const { userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const cloud = useAuthedQuery(api.simulator.html.list, {});
  const remove = useMutation(api.simulator.html.remove);
  const rename = useMutation(api.simulator.html.rename);
  const [local, setLocal] = useState<HtmlEntry[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      // Best effort: ask the browser not to evict this origin's storage,
      // since the HTML exists nowhere else for this account.
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
  const picker = useFilePicker((file) => void open(() => openHtml(file)));
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
    <LibraryShell
      picker={picker}
      accept=".html,.htm,text/html"
      inputLabel="Open HTML file"
      busy={busy}
      error={error}
    >
      <HtmlImportPanel
        busy={busy || !userId}
        choose={picker.open}
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
          <ClearAllButton
            label="Clear HTML library"
            confirmLabel="Confirm clear HTML library"
            title="Clear every HTML simulation and its progress from this device and your account."
            disabled={busy || !rows.length}
            onConfirm={async () => {
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
              }
            }}
          />
        }
      >
        {!rows.length ? (
          <LibraryEmpty search={search} art={<PixelCode />}>
            Your HTML simulations will appear here. Open a file or paste code to
            begin.
          </LibraryEmpty>
        ) : (
          <EntryList>
            {rows.map((row) => (
              <EntryRow
                key={row.contentHash}
                title={row.label}
                subtitle={
                  <>
                    {row.available
                      ? "Kept on this device"
                      : "Original HTML needed on this device"}{" "}
                    · {formatSavedAt(row.updatedAt)}
                  </>
                }
                href={`${ROOT}/${row.contentHash}`}
                action={row.available ? "Resume" : "Open"}
                disabled={busy}
                deleteMessage="Delete this HTML, its device progress, and its account library entry? Copies on other devices remain."
                onRename={async (label) => {
                  if (!userId) return;
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
                onDelete={async () => {
                  if (!userId) return;
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
              />
            ))}
          </EntryList>
        )}
      </ProgressSection>
    </LibraryShell>
  );
}
