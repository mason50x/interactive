import type { SyncStatus } from "@/lib/simulator/types";

/**
 * The one line under the game's title that says where its progress is.
 *
 * Sync has two halves that fail on their own: the device store and the
 * account. The cloud word is the headline, and when the device has a copy
 * the line says so first, so "cloud save pending" reads as reassurance
 * rather than warning. A device failure is prepended instead, because then
 * the cloud is the only copy there is. `aria-live` so the change from
 * pending to synced is heard without the reader having to look for it.
 */
export function SaveStatus({ status }: { status: SyncStatus }) {
  const cloud = {
    ready: "Ready",
    pending:
      status.local === "saved"
        ? "Saved on this device · Cloud save pending"
        : "Cloud save pending",
    syncing: "Syncing progress…",
    synced: "Synced",
    offline:
      status.local === "saved"
        ? "Saved on this device · Waiting for connection"
        : "Waiting for connection",
    conflict: "Progress conflict",
    deleted: "Cloud progress was deleted",
    failed: "Cloud save failed",
  }[status.cloud];
  return (
    <div
      className="space-y-1 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <p>
        {status.local === "failed" ? "Local backup unavailable · " : ""}
        {cloud}
      </p>
      {status.message && status.cloud === "failed" && <p>{status.message}</p>}
    </div>
  );
}
