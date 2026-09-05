import type { SyncStatus } from "@/lib/simulator/types";
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
