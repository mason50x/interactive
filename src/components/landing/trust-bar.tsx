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
    <section className="py-10 sm:py-14">
      <Container>
        <p className="label-small mb-7 text-center text-faint sm:mb-10">
          {trustBar.label}
        </p>
      </Container>
      {/* Both lengths scale with the viewport rather than sitting at the
          figure that suits a 1400px row. At 140px a phone shows two marks and
          a lot of nothing between them; the clamp keeps roughly the same
          count of logos on screen at every width. */}
      <LogoLoop
        logos={logos}
        speed={44}
        logoHeight="clamp(24px, 6.5vw, 30px)"
        gap="clamp(56px, 16vw, 140px)"
        fadeOut
        scaleOnHover
        ariaLabel={trustBar.label}
      />
    </section>
  );
}
