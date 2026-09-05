import type { Doc, Id } from "../../../convex/_generated/dataModel";
export type Entry = Doc<"simulatorEntries">;
export type Slot = "auto" | "previous" | "manual1" | "manual2" | "manual3";
export type WriteSlot = Exclude<Slot, "previous">;
export type Mode = "mono" | "color";
export type Program = { contentHash: string; bytes: ArrayBuffer; mode: Mode };
export type Builtin = {
  id: string;
  contentHash: string;
  label: string;
  mode: string;
  description: string;
  path: string;
};
export type Progress = {
  contentHash: string;
  mode: Mode;
  captureId: string;
  engineBuild: string;
  formatVersion: number;
  capturedAt: number;
  checkpoint: ArrayBuffer;
  battery?: ArrayBuffer;
};
export type LocalEntry = {
  contentHash: string;
  mode: Mode;
  label: string;
  entryId?: Id<"simulatorEntries">;
  revision: number;
  updatedAt: number;
  saves: Partial<Record<Slot, Progress>>;
  pending: Partial<Record<WriteSlot, Progress>>;
  conflictBackup?: Progress;
};
export type SyncStatus = {
  local: "ready" | "saved" | "failed";
  cloud:
    | "ready"
    | "pending"
    | "syncing"
    | "synced"
    | "offline"
    | "conflict"
    | "deleted"
    | "failed";
  message?: string;
};
export type Input =
  "up" | "down" | "left" | "right" | "A" | "B" | "start" | "select";
