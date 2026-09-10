import { brand, monogram } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * The IL monogram on its own, drawn in `currentColor`.
 *
 * The viewBox is cropped to the mark's ink box rather than its 100x100
 * design canvas, so the element has no built-in padding and its edges are
 * the letterforms themselves. Sized in `em` and baseline-aligned, which is
 * what lets it sit on the same cap line as text beside it.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="18 21 64 58"
      fill="currentColor"
      role="img"
      aria-label={brand.name}
      className={className}
    >
      <path d={monogram.path} />
    </svg>
  );
}

/**
 * The horizontal lockup: monogram plus name, sharing one cap line.
 *
 * `items-baseline` puts the SVG's bottom edge on the text baseline, and the
 * 0.727em height is Inter's cap height — so the mark is exactly as tall as
 * the capital I next to it at any font size.
 */
export function Wordmark({
  tone = "default",
  showName = true,
  short = false,
  className = "",
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
        "inline-flex items-baseline gap-[0.42em] text-[1.0625rem] leading-none",
        color,
        className,
      )}
    >
      <LogoMark className="h-[0.727em] w-[0.802em] shrink-0" />
      {showName && (
        <span className={cn("font-semibold whitespace-nowrap", nameClassName)}>
          {short ? brand.shortName : brand.name}
        </span>
      )}
    </span>
  );
}
