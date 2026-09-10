"use client";

import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The list under "Your progress": one row per simulation, or the empty
 * state when there are none. Both libraries list the same shape — a name, a
 * line about when and where it was saved, a link into the player, and
 * rename and delete — and only the words differ, so the rows take their
 * words as props and keep the prompts and confirmations to themselves.
 */

/** When a save happened, to the minute, in the reader's own locale. */
export function formatSavedAt(at: number) {
  return new Date(at).toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The bordered box the rows divide. */
export function EntryList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-background">
      {children}
    </div>
  );
}

/**
 * One saved simulation. Rename asks for the new name here and only calls
 * `onRename` with a non-empty answer; delete asks the caller's question and
 * only calls `onDelete` on a yes. `onRename` is optional because a Game Boy
 * entry that exists only on this device has nothing in the account to name.
 */
export function EntryRow({
  title,
  subtitle,
  href,
  action,
  disabled,
  deleteMessage,
  onRename,
  onDelete,
}: {
  title: string;
  subtitle: ReactNode;
  href: string;
  /** The label on the link into the player. */
  action: string;
  disabled?: boolean;
  /** The question `window.confirm` asks before `onDelete`. */
  deleteMessage: string;
  onRename?: (label: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ButtonLink variant="outline" href={href}>
        {action}
      </ButtonLink>
      {onRename && (
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            const label = window.prompt("Simulation name", title);
            if (label) onRename(label);
          }}
        >
          Rename
        </Button>
      )}
      <Button
        variant="ghost"
        disabled={disabled}
        onClick={() => {
          if (window.confirm(deleteMessage)) onDelete();
        }}
      >
        Delete
      </Button>
    </div>
  );
}

/**
 * What the list says with nothing in it. With a search in the box, the
 * message is that nothing matched and the artwork stays away; otherwise it
 * is the invitation to open a file, drawn with the library's pixel art.
 */
export function LibraryEmpty({
  search,
  art,
  children,
}: {
  search: string;
  art: ReactNode;
  children: ReactNode;
}) {
  return (
    <EmptyState
      as="div"
      className="flex flex-col items-center justify-center gap-5 rounded-xl border border-border px-6 py-10 text-sm leading-5"
    >
      {!search && art}
      <p>{search ? "No matching simulations." : children}</p>
    </EmptyState>
  );
}
