import { brand, logotype, mark } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * The Rift mark on its own — the logotype's R — drawn in `currentColor`.
 *
 * The viewBox is cropped to the mark's ink box rather than its 100x100
 * design canvas, so the element has no built-in padding and its edges are
 * the letter's own. The R is taller than it is wide: give it a height and
 * `w-auto` to hug it, or a square size to centre it.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={mark.inkBox}
      fill="currentColor"
      role="img"
      aria-label={brand.name}
      className={className}
    >
      <path fillRule="evenodd" d={mark.path} />
    </svg>
  );
}

/**
 * The logotype: "Rift", slanted, its letters strung on one cut band. Drawn in
 * `currentColor` and sized in `em` — a little over the line height, which
 * puts its cap height near the text beside it — so it scales with the
 * `text-*` size it is given.
 */
export function Wordmark({
  tone = "default",
  className,
}: {
  tone?: "default" | "inverted";
  className?: string;
}) {
  return (
    <svg
      viewBox={logotype.viewBox}
      fill="currentColor"
      role="img"
      aria-label={brand.name}
      className={cn(
        "inline-block h-[1.15em] w-auto shrink-0 text-[1.0625rem]",
        tone === "inverted" ? "text-panel-foreground" : "text-foreground",
        className,
      )}
    >
      <path fillRule="evenodd" d={logotype.path} />
    </svg>
  );
}
