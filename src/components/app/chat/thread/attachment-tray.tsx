"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { Spinner } from "@/components/ui/spinner";
import { Photo } from "@/components/app/chat/photo";
import type { Attached } from "@/components/app/chat/thread/use-attachments";
import { cn } from "@/lib/utils";

/**
 * The row of pictures waiting above the composer's field.
 *
 * The tray opens and closes by height. A grid row can go from `0fr` to `1fr`
 * and back, and unlike `height: auto` a browser can draw the frames in
 * between; the inner box clips what does not fit yet. The padding is inside
 * the clip so it closes with the rest.
 *
 * `ghost` is what the tray last held, drawn under the closing row so it has
 * something to close over — see `useAttachments` for why the previews behind
 * those thumbnails are kept alive until `onSettled` says the row has shut.
 */
export function AttachmentTray({
  attached,
  ghost,
  onRemove,
  onSettled,
}: {
  attached: Attached[];
  ghost: Attached[];
  onRemove: (entry: Attached) => void;
  onSettled: () => void;
}) {
  return (
    <div
      aria-hidden={attached.length === 0}
      onTransitionEnd={onSettled}
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
        attached.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="flex gap-2 overflow-x-auto px-3 pt-3">
          {(attached.length > 0 ? attached : ghost).map((entry) => (
            <Thumb
              key={entry.key}
              entry={entry}
              // A ghost is only ever drawn while the tray shuts over it;
              // pressing its cross would remove something already gone.
              onRemove={attached.length > 0 ? () => onRemove(entry) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * One picture in the tray: a square of it, dimmed with a spinner over it
 * until the server has said yes, and a cross to take it out at any point.
 */
function Thumb({
  entry,
  onRemove,
}: {
  entry: Attached;
  /** Absent on a ghost — see the tray above. */
  onRemove: (() => void) | undefined;
}) {
  const waiting = entry.state !== "ready";
  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-muted">
      <Photo
        src={entry.preview}
        className={cn(
          "size-full object-cover transition-opacity",
          waiting && "opacity-40",
        )}
      />
      {waiting ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner aria-hidden className="size-4 text-foreground" />
        </div>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        disabled={onRemove === undefined}
        tabIndex={onRemove === undefined ? -1 : undefined}
        aria-label="Remove picture"
        className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-[0_1px_3px_rgba(15,15,15,0.2)] transition-colors outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <XMarkIcon strokeWidth={2.5} className="size-3" />
      </button>
    </div>
  );
}
