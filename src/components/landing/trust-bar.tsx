"use client";

import { useMemo } from "react";

import { LogoLoop, type LogoItem } from "@/components/ui/logo-loop";
import { Container } from "@/components/ui/container";
import { trustBar } from "@/lib/content";
import { sourceLogos, type SourceLogo } from "@/lib/logos";

/* The brand colour rides in on a custom property so the dark override is a
   plain `dark:` class rather than fifteen inline styles that cannot respond
   to the theme. */
function Mark({ logo }: { logo: SourceLogo }) {
  const style = {
    "--brand": logo.color,
    "--brand-dark": logo.colorDark ?? logo.color,
  } as React.CSSProperties;

  const className = "text-[var(--brand)] dark:text-[var(--brand-dark)]";

  if (logo.wordmark) {
    return (
      <span
        style={style}
        className={`${className} font-serif text-[0.85em] whitespace-nowrap`}
      >
        {logo.name}
      </span>
    );
  }

  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      style={style}
      className={`${className} h-[1em] w-auto`}
      fill="currentColor"
      aria-hidden
    >
      <path d={logo.path} />
    </svg>
  );
}

export function TrustBar() {
  const logos = useMemo<LogoItem[]>(
    () =>
      sourceLogos.map((logo) => ({
        node: <Mark logo={logo} />,
        href: logo.href,
        title: logo.name,
        ariaLabel: logo.name,
      })),
    [],
  );

  return (
    <section className="py-14">
      <Container>
        <p className="label-small mb-10 text-center text-faint">{trustBar.label}</p>
      </Container>
      <LogoLoop
        logos={logos}
        speed={44}
        logoHeight={30}
        gap={140}
        fadeOut
        scaleOnHover
        ariaLabel={trustBar.label}
      />
    </section>
  );
}
