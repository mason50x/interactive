import type { ReactNode } from "react";
import { Monogram } from "@/components/app/chat/monogram";
import { personName } from "@/lib/chat";

/**
 * One person in a list, with whatever may be done to them on the right.
 *
 * Their display name over their handle when they have one, and the handle
 * alone when they do not; a role, where there is one, goes after the handle.
 */
export function Line({
  handle,
  name,
  detail,
  imageUrl,
  hue,
  emoji,
  initials,
  children,
}: {
  handle: string;
  name?: string;
  detail?: string;
  imageUrl?: string;
  /** The disc, when the row's source carries one. See `PublicProfile`. */
  hue?: number;
  emoji?: string;
  initials?: string;
  children?: ReactNode;
}) {
  const under = [name === undefined ? null : `@${handle}`, detail]
    .filter((part) => part !== null && part !== undefined)
    .join(" · ");

  return (
    <li className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0">
      <Monogram
        handle={handle}
        imageUrl={imageUrl}
        hue={hue}
        emoji={emoji}
        initials={initials}
        className="size-7 text-[0.75rem]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] font-medium">
          {personName({ handle, displayName: name })}
        </span>
        {under === "" ? null : (
          <span className="block truncate text-[0.75rem] text-faint">
            {under}
          </span>
        )}
      </span>
      <span className="flex shrink-0 gap-1">{children}</span>
    </li>
  );
}
