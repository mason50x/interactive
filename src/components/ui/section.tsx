import type { ReactNode } from "react";

export function Eyebrow({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "inverted";
}) {
  return (
    <span
      className={`label-small ${tone === "inverted" ? "text-panel-muted" : "text-faint"}`}
    >
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
}: {
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  align?: "left" | "center";
  tone?: "default" | "inverted";
  className?: string;
}) {
  const alignment =
    align === "center" ? "items-center text-center mx-auto" : "items-start";
  return (
    <div className={`flex max-w-3xl flex-col gap-4 ${alignment} ${className}`}>
      {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
      <h2
        className={`text-display text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem] ${
          tone === "inverted" ? "text-panel-foreground" : "text-foreground"
        }`}
      >
        {title}
      </h2>
      {body ? (
        <p
          className={`max-w-xl text-[1.0625rem] leading-relaxed ${
            tone === "inverted" ? "text-panel-muted" : "text-muted-foreground"
          }`}
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
    <section id={id} className={`py-20 sm:py-28 lg:py-36 ${className}`}>
      {children}
    </section>
  );
}
