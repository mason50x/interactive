"use client";

import { ArrowLeftIcon } from "@heroicons/react/24/solid";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";

/**
 * The column, while a group panel has it: a heading, the way back, and the
 * panel under both.
 *
 * The header is the conversation list's own header at the same metrics, for
 * the reason the tools panel's is — this is the column being one thing instead
 * of another, not a second kind of surface arriving in it. The way out is a
 * button on the right, where the tools panel's Back is, and it is the only way
 * out: nothing here closes because something else was pressed.
 */
export function Frame({
  title,
  onBack,
  loading,
  children,
}: {
  title: string;
  onBack: () => void;
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2">
        <h2 className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">
          {title}
        </h2>

        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-[0.8125rem] text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <ArrowLeftIcon className="size-4 shrink-0" />
          Back
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 animate-in flex-col gap-6 overflow-y-auto px-3 pb-4 duration-200 fade-in">
          {children}
        </div>
      )}
    </div>
  );
}
