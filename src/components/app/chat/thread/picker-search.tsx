"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

/**
 * The search field at the top of the emoji and GIF panels: a soft filled
 * pill with no border and no focus ring. The panel is already the focused
 * thing on screen, and a ring inside it read as a second, competing frame.
 */
export function PickerSearch({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <div
      className="flex h-10 min-w-0 items-center gap-2 rounded-full bg-foreground/[0.05] px-3.5 text-muted-foreground transition-colors focus-within:bg-foreground/[0.08] dark:bg-foreground/[0.07] dark:focus-within:bg-foreground/[0.1]"
      // Arrow keys and letters belong to the field, not the menu's navigation.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <MagnifyingGlassIcon className="size-4 shrink-0" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="-mr-1.5 grid size-7 shrink-0 place-items-center rounded-full outline-none hover:bg-foreground/[0.08] hover:text-foreground"
        >
          <XMarkIcon className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
