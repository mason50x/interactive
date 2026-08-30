import { brand, monogram } from "@/lib/brand";

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
 * The monogram in its container — black on white, always, in both themes.
 * This is the icon form: the favicon, the app icon, the avatar.
 */
export function LogoTile({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={monogram.viewBox}
      role="img"
      aria-label={brand.name}
      className={className}
    >
      <rect
        width="100"
        height="100"
        rx={monogram.tileRadius}
        fill={brand.colors.paper}
      />
      <path d={monogram.path} fill={brand.colors.ink} />
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
  className = "",
}: {
  tone?: "default" | "inverted";
  showName?: boolean;
  className?: string;
}) {
  const color =
    tone === "inverted" ? "text-panel-foreground" : "text-foreground";

  return (
    <span
      className={`inline-flex items-baseline gap-[0.42em] text-[1.0625rem] leading-none ${color} ${className}`}
    >
      <LogoMark className="h-[0.727em] w-[0.802em] shrink-0" />
      {showName && (
        <span className="font-semibold tracking-[-0.012em] whitespace-nowrap">
          {brand.name}
        </span>
      )}
    </span>
  );
}
