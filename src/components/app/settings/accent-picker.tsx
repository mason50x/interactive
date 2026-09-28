"use client";

import { CheckIcon, PlusIcon } from "@heroicons/react/24/solid";
import { useRef } from "react";
import {
  accentColor,
  accentInk,
  accents,
  type AccentId,
  isCustomAccent,
} from "@/lib/accent";
import { cn } from "@/lib/utils";

/**
 * The colours themselves, at the size they will be seen at, and a last swatch
 * that is any colour at all.
 *
 * A swatch is the control and the preview at once — a dropdown listing the
 * word "Violet" would be asking someone to imagine the thing they are choosing
 * while it sits one click away. The custom swatch opens the system colour
 * picker and wears whatever it last held, so a colour of your own is one of
 * the palette rather than a mode beside it.
 */
export function AccentPicker({
  value,
  onChange,
}: {
  value: AccentId;
  onChange: (accent: AccentId) => void;
}) {
  // A colour input reports every step of a drag; the account only needs to
  // hear where it came to rest.
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  const choose = (color: string) => {
    clearTimeout(pending.current);
    pending.current = setTimeout(() => onChange(color as AccentId), 120);
  };
  const custom = isCustomAccent(value);
  const customColor = custom ? accentColor(value) : null;

  return (
    <div
      role="radiogroup"
      aria-label="Accent colour"
      className="flex flex-wrap gap-2.5"
    >
      {accents.map((accent) => {
        const checked = accent.id === value;

        return (
          <button
            key={accent.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={accent.label}
            title={accent.label}
            onClick={() => onChange(accent.id)}
            style={{ backgroundColor: accent.color }}
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white ring-offset-2 ring-offset-card transition-[scale,box-shadow] duration-150 outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring/60",
              checked && "scale-110 ring-2 ring-primary",
            )}
          >
            {checked && <CheckIcon className="size-4" />}
          </button>
        );
      })}

      {/* The colour input sits under the swatch rather than being it, so the
          swatch can look like the others and still open the system picker. */}
      <label
        title="Your own colour"
        style={customColor ? { backgroundColor: customColor } : undefined}
        className={cn(
          "relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-[scale,box-shadow] duration-150 hover:scale-110 has-focus-visible:ring-2 has-focus-visible:ring-ring/60",
          custom
            ? "scale-110 ring-2 ring-primary"
            : "bg-[conic-gradient(from_0deg,#f43f5e,#f59e0b,#16a34a,#0891b2,#4f46e5,#c026d3,#f43f5e)]",
        )}
      >
        <input
          type="color"
          role="radio"
          aria-checked={custom}
          aria-label="Your own colour"
          defaultValue={customColor ?? "#3c85f7"}
          onChange={(event) => choose(event.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        {custom ? (
          <CheckIcon
            className="pointer-events-none size-4"
            style={{ color: accentInk(customColor!) }}
          />
        ) : (
          <span className="pointer-events-none flex size-5 items-center justify-center rounded-full bg-card/90 text-foreground">
            <PlusIcon className="size-3.5" />
          </span>
        )}
      </label>
    </div>
  );
}
