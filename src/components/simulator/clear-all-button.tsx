"use client";

import { useState } from "react";
import { TrashIcon } from "@heroicons/react/24/solid";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The bin beside the search box that empties a whole library.
 *
 * Too destructive for one click, not worth a dialog: the first press widens
 * the button to show "Confirm?" and the second does the deed. Blur and
 * Escape both put it back, so a reader who wandered off is not left with a
 * loaded button. The label swaps with the state so a screen reader hears
 * which press it is on; the visible word is hidden from it because the
 * label already says as much.
 */
export function ClearAllButton({
  label,
  confirmLabel,
  title,
  disabled,
  onConfirm,
}: {
  /** The action, as in "Clear all progress". */
  label: string;
  /** The same action on the second press, as in "Confirm clear all progress". */
  confirmLabel: string;
  title: string;
  disabled: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  return (
    <Button
      variant="ghost"
      aria-label={confirming ? confirmLabel : label}
      title={title}
      disabled={clearing || disabled}
      onBlur={() => setConfirming(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setConfirming(false);
      }}
      onClick={async () => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        if (clearing) return;
        setClearing(true);
        try {
          await onConfirm();
        } finally {
          setClearing(false);
          setConfirming(false);
        }
      }}
      className={cn(
        "relative h-9 gap-0 overflow-hidden px-2.5 transition-[width,color,background-color] duration-300 ease-in-out motion-reduce:transition-none",
        confirming ? "w-28 text-destructive" : "w-9 text-muted-foreground",
      )}
    >
      <TrashIcon className="absolute left-2.5 size-4" />
      <span
        aria-hidden="true"
        className={cn(
          "ml-6 whitespace-nowrap transition-[opacity,transform] duration-300 ease-in-out motion-reduce:transition-none",
          confirming ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0",
        )}
      >
        Confirm?
      </span>
    </Button>
  );
}
