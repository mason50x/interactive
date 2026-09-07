import { useRef } from "react";
import type {
  LocalEntry,
  Slot,
  WriteSlot,
  Progress,
} from "@/lib/simulator/types";
import { Button } from "@/components/ui/button";
import { exportProgress, importProgress } from "@/lib/simulator/progress";
export function SavesPanel({
  record,
  disabled,
  save,
  restore,
  importSave,
  onError,
}: {
  record: LocalEntry | null;
  disabled: boolean;
  save: (slot: WriteSlot) => void;
  restore: (slot: Slot) => void;
  importSave: (p: Progress) => void;
  onError: (message: string) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <section aria-label="Save slots" className="rounded-xl border border-border bg-background p-5">
      <div className="divide-y divide-border">
        {(["auto", "previous", "manual1", "manual2", "manual3"] as Slot[]).map(
          (slot, i) => {
            const p = record?.saves[slot];
            return (
              <div
                key={slot}
                className="flex flex-wrap items-center gap-2 py-3"
              >
                <div className="min-w-24 flex-1">
                  <p className="text-sm font-medium">
                    {
                      [
                        "Latest autosave",
                        "Previous autosave",
                        "Slot 1",
                        "Slot 2",
                        "Slot 3",
                      ][i]
                    }
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p ? new Date(p.capturedAt).toLocaleString() : "Empty"}
                  </p>
                </div>
                {slot.startsWith("manual") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => {
                      if (
                        !p ||
                        window.confirm("Replace the progress in this slot?")
                      )
                        save(slot as WriteSlot);
                    }}
                  >
                    Save
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled || !p}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Restore this saved progress? Current progress will become the previous autosave.",
                      )
                    )
                      restore(slot);
                  }}
                >
                  Restore
                </Button>
                {p && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => exportProgress(p)}
                  >
                    Export
                  </Button>
                )}
              </div>
            );
          },
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => file.current?.click()}
        >
          Import progress
        </Button>
        {record?.conflictBackup && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportProgress(record.conflictBackup!)}
          >
            Export conflict backup
          </Button>
        )}
      </div>
      <input
        ref={file}
        type="file"
        accept=".progress,.json"
        className="hidden"
        aria-label="Import progress file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f || !record) return;
          try {
            importSave(await importProgress(f, record.contentHash));
          } catch (err) {
            onError(err instanceof Error ? err.message : "Import failed.");
          }
        }}
      />
    </section>
  );
}
