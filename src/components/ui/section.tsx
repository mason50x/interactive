import type { ComponentProps, ReactNode } from "react";

import { Container, type ContainerWidth } from "@/components/ui/container";
import { cn } from "@/lib/utils";

/**
 * The small line above a heading. Set in the brand colour at the type's
 * natural case and spacing: it is a label, not a shout.
 */
function Eyebrow({
  className,
  tone = "default",
  children,
  ...props
}: ComponentProps<"span"> & { tone?: "default" | "inverted" }) {
  return (
    <span
      data-slot="eyebrow"
      className={cn(
        "inline-flex items-center gap-2 text-[0.875rem] font-medium",
        tone === "inverted" ? "text-primary-soft" : "text-primary",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
      />
      {children}
    </span>
  );
}

/**
 * Eyebrow, title and lede, stacked, for the head of a section.
 *
 * The title is an `h2` because a section heading sits under the page's one
 * `h1`; `PageIntro` below is the same stack at the top of a page, where the
 * title is the `h1`.
 */
function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left",
  tone = "default",
  size = "default",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  align?: "left" | "center";
  tone?: "default" | "inverted";
  size?: "default" | "large";
  className?: string;
}) {
  return (
    <div
      data-slot="section-heading"
      className={cn(
        "flex max-w-2xl flex-col gap-4",
        align === "center" ? "mx-auto items-center text-center" : "items-start",
        className,
      )}
    >
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

/**
 * The head of a marketing page: eyebrow, the page's `h1` at display size,
 * and a lede. The about and contact pages open with exactly this.
 */
function PageIntro({
  eyebrow,
  title,
  body,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-intro"
      className={cn("flex max-w-3xl flex-col gap-5", className)}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h1 className="text-display text-[2.5rem] text-balance text-foreground sm:text-[3.5rem] lg:text-[4.25rem]">
        {title}
      </h1>
      {body ? (
        <p className="max-w-2xl text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground sm:text-[1.1875rem]">
          {body}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One band of a marketing page.
 *
 * `rhythm` is the vertical breathing room, and there are three steps of it
 * rather than a number per section: the default for the run of the page,
 * `tight` for a strip that is a single row, `hero` for the opening band that
 * has the header's space above it already. `divider` draws the hairline
 * between one band and the next. `width` puts a `Container` inside, which is
 * what every section wants and what none of them should have to repeat.
 */
function Section({
  id,
  className,
  rhythm = "default",
  divider = false,
  width,
  children,
  ...props
}: ComponentProps<"section"> & {
  rhythm?: "default" | "tight" | "hero";
  divider?: boolean;
  width?: ContainerWidth;
}) {
  return (
    <section
      id={id}
      data-slot="section"
      className={cn(
        "scroll-mt-20",
        rhythm === "default" && "py-20 sm:py-24 lg:py-32",
        rhythm === "tight" && "py-14 sm:py-16",
        rhythm === "hero" && "pt-14 pb-20 sm:pt-20 sm:pb-24 lg:pt-24 lg:pb-32",
        divider && "border-t border-border",
        className,
      )}
      {...props}
    >
      {width ? <Container width={width}>{children}</Container> : children}
    </section>
  );
}

export { Eyebrow, PageIntro, Section, SectionHeading };
