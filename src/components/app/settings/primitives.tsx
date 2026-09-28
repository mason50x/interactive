"use client";

import { CheckIcon } from "@heroicons/react/24/solid";
import { createContext, use, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./settings.module.css";

/**
 * The pieces every section of the Settings page is built from: a section, the
 * cards inside it, the rows inside those, and the tile grid for a choice that
 * is better seen than read.
 *
 * Search runs through them rather than over them. The query sits in context;
 * each row decides for itself whether it matches — its label, its line of
 * description, a few words it answers to, or the section it is in — and
 * everything above a row takes its visibility from its rows in CSS. See
 * `settings.module.css`.
 */

const SearchContext = createContext("");
const SectionTitleContext = createContext("");

export const SettingsSearch = SearchContext.Provider;

function normalise(text: string) {
  return text.toLowerCase().normalize("NFKD");
}

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={styles.section}>
      <h2 id={`${id}-title`} className="mb-6 text-[1.375rem] font-semibold">
        {title}
      </h2>
      <SectionTitleContext value={title}>
        <div className="flex flex-col gap-8">{children}</div>
      </SectionTitleContext>
    </section>
  );
}

/** A card of rows, with an optional small heading above it. */
export function Group({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={styles.group}>
      {title && (
        <h3 className="mb-2 text-[0.8125rem] font-medium text-muted-foreground">
          {title}
        </h3>
      )}
      <div
        className={cn(
          "divide-y divide-border border-y border-border",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * One setting: what it is, what it does, and the control.
 *
 * `inline` puts the control on the label's line, for a switch or a short
 * select; `stack` puts it underneath at full width, for a grid of tiles or a
 * list. The description is the one line that says what changes — the label
 * says what it is.
 */
export function Row({
  label,
  description,
  keywords = "",
  layout = "inline",
  badge,
  children,
}: {
  label: string;
  description?: ReactNode;
  keywords?: string;
  layout?: "inline" | "stack";
  badge?: string;
  children: ReactNode;
}) {
  const query = normalise(use(SearchContext).trim());
  const section = use(SectionTitleContext);
  const haystack = normalise(
    [
      label,
      typeof description === "string" ? description : "",
      keywords,
      section,
    ].join(" "),
  );
  const matches =
    !query || query.split(/\s+/).every((word) => haystack.includes(word));

  return (
    <div
      data-setting
      hidden={!matches}
      className={cn(
        "py-4",
        layout === "inline" &&
          "flex flex-wrap items-center justify-between gap-x-6 gap-y-3",
      )}
    >
      <div className={cn("min-w-0", layout === "inline" && "flex-1 basis-56")}>
        <p className="flex items-center gap-2 text-[0.875rem] font-medium">
          {label}
          {badge && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.6875rem] font-medium text-primary">
              {badge}
            </span>
          )}
        </p>
        {description && (
          <p className="mt-0.5 text-[0.8125rem] text-pretty text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div
        className={cn(
          layout === "inline" ? "flex shrink-0 justify-end" : "mt-4",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A choice drawn as the thing itself: each option a tile with a small
 * picture of what it does over its name, the chosen one ringed in the accent.
 * For the settings where the word alone — "Floating", "Soft" — would leave
 * someone guessing what they are about to get.
 */
export function Tiles<Value extends string>({
  label,
  value,
  onChange,
  options,
  columns = 4,
}: {
  label: string;
  value: Value;
  onChange: (value: Value) => void;
  options: readonly {
    value: Value;
    label: string;
    preview: ReactNode;
  }[];
  columns?: 2 | 3 | 4 | 6;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "grid gap-2.5",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-2 page-sm:grid-cols-3",
        columns === 4 && "grid-cols-2 page-sm:grid-cols-4",
        columns === 6 && "grid-cols-2 page-sm:grid-cols-3 page-xl:grid-cols-6",
      )}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={cn(
              "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-background text-left transition-[border-color,box-shadow] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              checked
                ? "border-primary ring-1 ring-primary"
                : "border-border hover:border-border-strong",
            )}
          >
            <span className="relative flex h-16 items-center justify-center overflow-hidden border-b border-border bg-muted/50">
              {option.preview}
            </span>
            <span className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate text-[0.8125rem] font-medium">
                {option.label}
              </span>
              <span
                className={cn(
                  "flex size-4.5 shrink-0 items-center justify-center rounded-full transition-[background-color,opacity,scale] duration-200",
                  checked
                    ? "scale-100 bg-primary text-primary-foreground opacity-100"
                    : "scale-75 opacity-0",
                )}
              >
                <CheckIcon className="size-3" />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
