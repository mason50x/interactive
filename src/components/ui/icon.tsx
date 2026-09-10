import type { ComponentProps } from "react";

/**
 * The two shells a hand-drawn icon is built on, to Heroicons' rules.
 *
 * Every icon this app draws itself — the rail's glyphs, the brain, the
 * controller — is meant to sit beside a real Heroicon as one of the set, and
 * the set has two cuts: an outline at a 1.5 stroke with round caps and
 * joins, and a solid fill. The shells carry those settings, the 24-unit
 * viewBox, and `aria-hidden`, so an icon file is only its path data.
 *
 * Both take `ComponentProps<"svg">`, which is what makes them an `Icon` in
 * the sense of `src/lib/icons.ts`: sized by a class, coloured by
 * `currentColor`, and interchangeable with an import from the package.
 */
export type IconProps = ComponentProps<"svg">;

function OutlineIcon(props: IconProps) {
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
    />
  );
}

function SolidIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    />
  );
}

export { OutlineIcon, SolidIcon };
