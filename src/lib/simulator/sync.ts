import { ConvexError } from "convex/values";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type {
  Entry,
  LocalEntry,
  Mode,
  Progress,
  Slot,
  WriteSlot,
  SyncStatus,
} from "./types";
import { readLocal, writeLocal } from "./local-store";
import { validateProgress } from "./progress";
const timeout = <T>(promise: Promise<T>, ms = 10000) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () =>
        reject(
          new Error("Cloud connection timed out. Your local progress is safe."),
        ),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
export class ProgressSync {
  record: LocalEntry;
  status: SyncStatus = { local: "ready", cloud: "ready" };
  private flight: Promise<void> | null = null;
  private writes = Promise.resolve();
  private stopped = false;
  private retry = 0;
  private failures = 0;
  private cloudAt = 0;
  private retryAt = 0;
  private rejected = false;
  constructor(
    private owner: string,
    hash: string,
    mode: Mode,
    private client: ConvexReactClient,
    private changed: () => void,
  ) {
    this.record = {
      contentHash: hash,
      mode,
      label: "Imported simulation",
      revision: 0,
      updatedAt: Date.now(),
      saves: {},
      pending: {},
    };
  }
  private notify() {
    if (!this.stopped) this.changed();
  }
  private persist() {
    const snapshot = structuredClone(this.record);
    this.writes = this.writes
      .catch(() => {})
      .then(async () => {
        try {
          await writeLocal(this.owner, snapshot);
          this.status.local = "saved";
        } catch {
          this.status.local = "failed";
          this.status.message =
            "Local backup is unavailable. Export progress to keep a device copy.";
        }
        this.notify();
      });
    return this.writes;
  }
  async init() {
    try {
      const local = await readLocal(this.owner, this.record.contentHash);
      if (local) {
        this.record = local;
        this.status.local = "saved";
      }
    } catch {
      this.status.local = "failed";
    }
    if (!navigator.onLine) {
      this.status.cloud = "offline";
      this.notify();
      return;
    }
    try {
      await this.reconcile();
    } catch (error) {
      this.status.cloud = "failed";
      this.status.message =
        error instanceof Error
          ? error.message
          : "Cloud progress could not load.";
    }
    this.notify();
  }
  private async cloudEntry(): Promise<Entry | null> {
    return timeout(
      this.client.query(api.simulator.library.get, {
        contentHash: this.record.contentHash,
      }),
    );
  }
  private async reconcile(register = false) {
    let cloud = await this.cloudEntry();
    if (this.stopped) return;
    if (this.record.entryId && (!cloud || cloud._id !== this.record.entryId)) {
      this.status.cloud = "deleted";
      return;
    }
    if (!cloud && !register) {
      this.status.cloud = "ready";
      return;
    }
    if (!cloud)
      cloud = await timeout(
        this.client.mutation(api.simulator.library.register, {
          contentHash: this.record.contentHash,
          mode: this.record.mode,
        }),
      );
    if (this.stopped) return;
    this.record.entryId = cloud._id;
    this.record.label = cloud.label;
    if (Object.keys(this.record.pending).length) {
      // Recover an accepted write whose acknowledgement was lost. Only the
      // current cloud revision proves no other writer committed after it.
      if (cloud.revision !== this.record.revision) {
        const metas = await timeout(
          this.client.query(api.simulator.saves.list, { entryId: cloud._id }),
        );
        const acknowledged = metas.find(
          (meta) =>
            meta.slot !== "previous" &&
            meta.revision === cloud.revision &&
            this.record.pending[meta.slot]?.captureId === meta.captureId,
        );
        if (acknowledged && acknowledged.slot !== "previous") {
          delete this.record.pending[acknowledged.slot];
          this.record.revision = cloud.revision;
          await this.persist();
        }
      }
      // Never give an offline branch a newer base revision merely because it reconnected.
      if (cloud.revision !== this.record.revision) {
        this.status.cloud = "conflict";
        return;
      }
      this.status.cloud = "pending";
      await this.persist();
      return;
    }
    await this.adoptCloud(cloud);
  }
  private async adoptCloud(cloud: Entry) {
    const metas = await timeout(
      this.client.query(api.simulator.saves.list, { entryId: cloud._id }),
    );
    const saves: LocalEntry["saves"] = {};
    for (const meta of metas) {
      const s = await timeout(
        this.client.query(api.simulator.saves.read, {
          entryId: cloud._id,
          slot: meta.slot,
        }),
      );
      if (s)
        saves[s.slot] = validateProgress(
          {
            contentHash: cloud.contentHash,
            mode: cloud.mode,
            captureId: s.captureId,
            engineBuild: s.engineBuild,
            formatVersion: s.formatVersion,
            capturedAt: s.capturedAt,
            checkpoint: s.checkpoint,
            ...(s.battery ? { battery: s.battery } : {}),
          },
          cloud.contentHash,
        );
    }
    // A coherent revision is required across the separate payload reads.
    const verify = await this.cloudEntry();
    if (
      !verify ||
      verify._id !== cloud._id ||
      verify.revision !== cloud.revision
    )
      throw new Error("Cloud progress changed while loading. Try again.");
    if (this.stopped) return;
    this.record = {
      ...this.record,
      entryId: cloud._id,
      label: cloud.label,
      mode: cloud.mode,
      revision: cloud.revision,
      saves,
      pending: {},
    };
    this.status.cloud = "synced";
    await this.persist();
  }
  async capture(progress: Progress, slot: WriteSlot = "auto") {
    progress = validateProgress(progress, this.record.contentHash);
    if (slot === "auto" && this.record.saves.auto)
      this.record.saves.previous = this.record.saves.auto;
    this.record.saves[slot] = progress;
    this.record.pending[slot] = progress;
    this.record.updatedAt = Date.now();
    if (!["conflict", "deleted"].includes(this.status.cloud))
      this.status.cloud = navigator.onLine ? "pending" : "offline";
    await this.persist();
    this.notify();
  }
  flush(force = false): Promise<void> {
    if (!Object.keys(this.record.pending).length) return Promise.resolve();
    if (
      this.stopped ||
      this.flight ||
      ["conflict", "deleted"].includes(this.status.cloud)
    )
      return this.flight ?? Promise.resolve();
    if (!navigator.onLine) {
      this.status.cloud = "offline";
      this.notify();
      return Promise.resolve();
    }
    if (
      !force &&
      (this.rejected ||
        Date.now() < this.retryAt ||
        Date.now() - this.cloudAt < 60000)
    )
      return Promise.resolve();
    this.flight = this.send().finally(() => {
      this.flight = null;
      this.notify();
    });
    return this.flight;
  }
  private async send() {
    try {
      if (!this.record.entryId) {
        await this.reconcile(true);
        if (["conflict", "deleted"].includes(this.status.cloud) || this.stopped)
          return;
      }
      const entryId = this.record.entryId;
      if (!entryId) return;
      // Autosave first; manual captures made during a request stay in the outbox.
      for (const slot of [
        "auto",
        "manual1",
        "manual2",
        "manual3",
      ] as WriteSlot[]) {
        if (this.stopped) return;
        const save = this.record.pending[slot];
        if (!save) continue;
        this.status.cloud = "syncing";
        this.notify();
        const { contentHash, mode, ...payload } = save;
        void contentHash;
        void mode;
        const result = await timeout(
          this.client.mutation(api.simulator.saves.commit, {
            entryId,
            expectedRevision: this.record.revision,
            slot,
            ...payload,
          }),
        );
        if (this.stopped) return;
        if (!result.ok) {
          if (result.reason === "rate-limit") {
            this.status.cloud = "pending";
            this.schedule(result.retryAfter ?? 15000);
            return;
          }
          this.status.cloud = result.reason;
          return;
        }
        this.record.revision = result.revision;
        if (this.record.pending[slot]?.captureId === save.captureId)
          delete this.record.pending[slot];
        await this.persist();
      }
      this.failures = 0;
      this.rejected = false;
      this.retryAt = 0;
      this.cloudAt = Date.now();
      this.status.cloud = Object.keys(this.record.pending).length
        ? "pending"
        : "synced";
    } catch (error) {
      this.status.cloud = navigator.onLine ? "failed" : "offline";
      this.status.message =
        error instanceof Error ? error.message : "Cloud save failed.";
      this.failures++;
      this.rejected = error instanceof ConvexError;
      if (!(error instanceof ConvexError))
        this.schedule(
          Math.min(60000, 2000 * 2 ** Math.min(this.failures, 5)) *
            (0.8 + Math.random() * 0.4),
        );
    }
  }
  private schedule(ms: number) {
    clearTimeout(this.retry);
    this.retryAt = Date.now() + ms;
    if (!this.stopped)
      this.retry = window.setTimeout(() => void this.flush(true), ms);
  }
  async chooseLocal() {
    await this.flight;
    const cloud = await this.cloudEntry();
    if (!cloud || cloud._id !== this.record.entryId) {
      this.status.cloud = "deleted";
      this.notify();
      return;
    }
    this.record.revision = cloud.revision;
    this.status.cloud = "pending";
    await this.persist();
    await this.flush(true);
  }
  async chooseCloud() {
    await this.flight;
    const cloud = await this.cloudEntry();
    if (!cloud || cloud._id !== this.record.entryId) {
      this.status.cloud = "deleted";
      this.notify();
      return;
    }
    this.record.conflictBackup = this.record.saves.auto;
    await this.persist();
    await this.adoptCloud(cloud);
    this.notify();
  }
  async restore(slot: Slot) {
    const save = this.record.saves[slot];
    if (!save) throw new Error("This slot is empty.");
    const copy = {
      ...save,
      captureId: crypto.randomUUID(),
      capturedAt: Date.now(),
    };
    await this.capture(copy);
    return copy;
  }
  async refresh() {
    await this.flight;
    await this.reconcile();
    this.notify();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
  }
}
