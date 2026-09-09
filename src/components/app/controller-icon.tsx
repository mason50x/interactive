import type { ComponentProps } from "react";

/**
 * A game controller, in both Heroicons cuts, because the set has none.
 *
 * Drawn to the 24px set's rules so it sits beside the real ones as one of
 * them: a 1.5 stroke with round caps and joins, its buttons the same
 * zero-length dashes Heroicons uses for dots. The solid cut is
 * `ControllerIconSolid` in `nav-icons.tsx`, drawn in parts so it can move.
 */
export function ControllerIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8.25 6.75h7.5c2.75 0 4.95 2.05 5.25 4.75l.6 4.7c.2 1.3-.8 2.55-2.1 2.55-.7 0-1.4-.35-1.8-.9L15.6 15H8.4l-2.1 2.85c-.4.55-1.1.9-1.8.9-1.3 0-2.3-1.25-2.1-2.55l.6-4.7C3.3 8.8 5.5 6.75 8.25 6.75Z" />
      <path d="M7.5 9.75v4.5M5.25 12h4.5" />
      <path d="M15.75 12.75h.008v.008h-.008v-.008ZM18 10.5h.008v.008H18V10.5Z" />
    </svg>
  );
}
