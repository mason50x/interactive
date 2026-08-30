import { SignUpButton } from "@clerk/nextjs";
import { closingCta } from "@/lib/content";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export function ClosingCta() {
  return (
    <section className="border-t border-border py-20 sm:py-28">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] bg-panel px-6 py-20 text-center sm:px-12 sm:py-28">
          {/* Faint map echo behind the copy. */}
          <svg
            viewBox="0 0 800 300"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]"
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
                <circle key={`${x}`} cx={x} cy={y} r="7" />
              ))}
            </g>
          </svg>

          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
            <h2 className="text-serif-display text-[2.5rem] text-panel-foreground sm:text-[3.75rem]">
              {closingCta.heading.split("\n").map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h2>
            <p className="max-w-lg text-[1.0625rem] leading-relaxed text-panel-muted">
              {closingCta.body}
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <SignUpButton>
                <Button variant="inverted" size="xl">
                  {closingCta.primary}
                </Button>
              </SignUpButton>
              <ButtonLink href="#educators" variant="inverted-outline" size="xl">
                {closingCta.secondary}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
