import { closingCta } from "@/lib/content";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export function ClosingCta() {
  return (
    <section className="border-t border-border py-20 sm:py-24">
      <Container>
        <div className="relative overflow-hidden rounded-[1.5rem] bg-panel px-6 py-16 text-center sm:px-12 sm:py-24">
          {/* Faint map echo behind the copy. */}
          <svg
            viewBox="0 0 800 300"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]"
            aria-hidden
          >
            <g fill="none" stroke="var(--primary)" strokeWidth="1.5">
              <path d="M60 220 C 180 220, 200 90, 320 90" />
              <path d="M320 90 C 440 90, 460 230, 580 230" />
              <path d="M580 230 C 680 230, 700 140, 760 140" />
            </g>
            <g fill="var(--primary)">
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
            <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <ButtonLink href="/auth/sign-up" variant="inverted" size="xl">
                {closingCta.primary}
              </ButtonLink>
              <ButtonLink href="/contact" variant="inverted-outline" size="xl">
                {closingCta.secondary}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
