import { CtaPair } from "@/components/landing/cta-pair";
import { accent } from "@/components/landing/palette";
import { Section } from "@/components/ui/section";
import { closingCta } from "@/lib/content";

/**
 * The last word on the page: the dark panel with the two ways in, and a
 * faint echo of a map drawn behind the copy so the panel is a picture of
 * the product's idea and not only a box with buttons in it.
 */
export function ClosingCta() {
  return (
    <Section divider width="default" className="py-20 sm:py-24 lg:py-24">
      <div className="relative overflow-hidden rounded-[1.5rem] bg-panel px-6 py-16 text-center sm:px-12 sm:py-24">
        {/* Faint map echo behind the copy. */}
        <svg
          viewBox="0 0 800 300"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]"
          aria-hidden
        >
          <g fill="none" stroke={accent} strokeWidth="1.5">
            <path d="M60 220 C 180 220, 200 90, 320 90" />
            <path d="M320 90 C 440 90, 460 230, 580 230" />
            <path d="M580 230 C 680 230, 700 140, 760 140" />
          </g>
          <g fill={accent}>
            {[
              [60, 220],
              [320, 90],
              [580, 230],
              [760, 140],
            ].map(([x, y]) => (
              <circle key={`${x}`} cx={x} cy={y} r="6" />
            ))}
          </g>
        </svg>

        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
          <h2 className="text-display text-[2.25rem] text-balance text-panel-foreground sm:text-[3rem] lg:text-[3.5rem]">
            {closingCta.heading}
          </h2>
          <p className="max-w-lg text-[1.0625rem] leading-relaxed text-panel-muted">
            {closingCta.body}
          </p>
          <CtaPair
            size="xl"
            tone="inverted"
            className="mt-2 w-full sm:w-auto"
            primary={{ href: "/auth/sign-up", label: closingCta.primary }}
            secondary={{ href: "/contact", label: closingCta.secondary }}
          />
        </div>
      </div>
    </Section>
  );
}
