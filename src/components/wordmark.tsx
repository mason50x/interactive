import { brand, mark } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * The Rift airplane on its own, drawn in `currentColor`.
 *
 * The viewBox is cropped to the mark's ink box rather than its 100x100
 * design canvas, so the element has no built-in padding and its edges are
 * the wingtips, nose and tail themselves. Sized in `em`, so it scales with
 * the text beside it.
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
 * The horizontal lockup: the airplane plus the name.
 *
 * The mark is a diagonal, so its visual mass sits in the middle of its square
 * rather than on a baseline; centring it against the name and letting it run
 * a little past the cap height is what makes the two read at the same weight.
 */
export function Wordmark({
  tone = "default",
  showName = true,
  short = false,
  className,
  nameClassName,
}: {
  tone?: "default" | "inverted";
  showName?: boolean;
  /**
   * Drop to `brand.shortName`. For the app rail, where the lockup is a place
   * marker rather than a signature — the name has already been read on the way
   * in, and at 15rem the full one takes a third of the column to repeat it.
   */
  short?: boolean;
  className?: string;
  /** Classes for the name alone. The app rail fades it out of the lockup. */
  nameClassName?: string;
}) {
  const color =
    tone === "inverted" ? "text-panel-foreground" : "text-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.36em] text-[1.0625rem] leading-none",
        color,
        className,
      )}
    >
      <LogoMark className="size-[1.05em] shrink-0" />
      {showName && (
        <span className={cn("font-semibold whitespace-nowrap", nameClassName)}>
          {short ? brand.shortName : brand.name}
        </span>
      )}
    </span>
  );
}
