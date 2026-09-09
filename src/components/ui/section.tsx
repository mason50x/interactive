import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The small line above a heading. Set in the brand colour at the type's
 * natural case and spacing: it is a label, not a shout.
 */
export function Eyebrow({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "inverted";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[0.875rem] font-medium",
        tone === "inverted" ? "text-primary-soft" : "text-primary",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
      />
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left",
  tone = "default",
  className = "",
  size = "default",
}: {
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  align?: "left" | "center";
  tone?: "default" | "inverted";
  className?: string;
  size?: "default" | "large";
}) {
  const alignment =
    align === "center" ? "items-center text-center mx-auto" : "items-start";
  return (
    <div className={cn("flex max-w-2xl flex-col gap-4", alignment, className)}>
      {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
      <h2
        className={cn(
          "text-display text-balance",
          size === "large"
            ? "text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem]"
            : "text-[2rem] sm:text-[2.5rem] lg:text-[2.875rem]",
          tone === "inverted" ? "text-panel-foreground" : "text-foreground",
        )}
      >
        {title}
      </h2>
      {body ? (
        <p
          className={cn(
            "max-w-xl text-[1.0625rem] leading-relaxed text-pretty",
            tone === "inverted" ? "text-panel-muted" : "text-muted-foreground",
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

export function Section({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-20 py-20 sm:py-24 lg:py-32", className)}
    >
      {children}
    </section>
  );
}
