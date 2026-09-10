import type { ReactNode } from "react";

/**
 * A heading with the rule running out of both sides of it.
 *
 * For a heading that is cutting a panel into parts rather than naming a column.
 * The tool panel's list headings — Friends, Blocked, Waiting on you — sit left
 * above their list and stay that way; these say "a different thing starts
 * here", and a line across the whole width is what says it.
 *
 * The rules are `aria-hidden`: a heading that reads out as "line, who can reach
 * you, line" helps nobody.
 *
 * Shared by the tools panel and the group sheets, which is the whole reason it
 * is a file — the two sit one click apart and a heading that looked different
 * in each would read as two different apps.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="h-px flex-1 bg-border" />
      <p className="text-xs font-semibold text-muted-foreground">{children}</p>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
