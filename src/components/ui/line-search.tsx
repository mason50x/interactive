"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

export function LineSearch({
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
    <div className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/30">
      <MagnifyingGlassIcon className="size-4 shrink-0" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="grid size-7 shrink-0 place-items-center rounded-md hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <XMarkIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
