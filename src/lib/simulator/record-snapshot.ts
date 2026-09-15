import type { LocalEntry } from "./types";

/**
 * Detach the mutable slot maps for React without copying save payloads on
 * every sync-status update. Progress objects and their buffers are replaced,
 * never edited; restore copies their bytes into the native engine's memory.
 * Persistence still takes a full defensive clone in ProgressSync.persist.
 */
export function snapshotRecord(record: LocalEntry): LocalEntry {
  return {
    ...record,
    saves: { ...record.saves },
    pending: { ...record.pending },
  };
}
