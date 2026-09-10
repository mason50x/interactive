import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Cta = {
  href: string;
  label: ReactNode;
  className?: string;
};

/**
 * Two calls to action side by side: the one we want taken, and the softer
 * one for a reader who is not ready.
 *
 * Stacked on a phone and in a row from `sm` up. `tone` picks the pair of
 * button variants for the surface — brand and outline on the page, the
 * inverted pair on the dark panel — so a call site never has to know which
 * two variants go together.
 */
export function CtaPair({
  primary,
  secondary,
  size,
  tone = "default",
  className,
}: {
  primary: Cta;
  secondary: Cta;
  size: "md" | "xl";
  tone?: "default" | "inverted";
  className?: string;
}) {
  const inverted = tone === "inverted";

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row", className)}>
      <ButtonLink
        href={primary.href}
        variant={inverted ? "inverted" : "default"}
        size={size}
        className={primary.className}
      >
        {primary.label}
      </ButtonLink>
      <ButtonLink
        href={secondary.href}
        variant={inverted ? "inverted-outline" : "outline"}
        size={size}
        className={secondary.className}
      >
        {secondary.label}
      </ButtonLink>
    </div>
  );
}
