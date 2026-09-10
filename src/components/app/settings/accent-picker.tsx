"use client";

import { CheckIcon } from "@heroicons/react/24/solid";
import { accents, type AccentId } from "@/lib/preferences";
import { cn } from "@/lib/utils";

/**
 * The colours themselves, at the size they will be seen at.
 *
 * A swatch is the control and the preview at once — a dropdown listing the
 * word "Violet" would be asking someone to imagine the thing they are choosing
 * while it sits one click away.
 */
export function AccentPicker({
  value,
  onChange,
}: {
  value: AccentId;
  onChange: (accent: AccentId) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Accent colour" className="flex gap-1">
      {accents.map((accent) => {
        const checked = accent.id === value;

        return (
          <button
            key={accent.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={accent.label}
            onClick={() => onChange(accent.id)}
            style={{ backgroundColor: accent.color }}
            className={cn(
              "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-transform duration-150 outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
              checked && "scale-110",
            )}
          >
            {checked && <CheckIcon className="size-3.5" />}
          </button>
        );
      })}
    </div>
  );
}
