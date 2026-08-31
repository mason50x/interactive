import { showcase } from "@/lib/content";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { AppFrame } from "@/components/visuals/app-frame";
import { ConceptMap } from "@/components/visuals/concept-map";

export function Showcase() {
  return (
    <section id="platform" className="pt-20 pb-20 sm:pt-28 sm:pb-28">
      <Container>
        <div className="overflow-hidden rounded-[2rem] bg-panel px-6 pt-16 pb-8 sm:px-10 sm:pt-24 lg:px-16">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
            <h2 className="text-serif-display text-[2.5rem] text-panel-foreground sm:text-[3.5rem] lg:text-[4rem]">
              {showcase.heading.split("\n").map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h2>
            <p className="max-w-xl text-[1.0625rem] leading-relaxed text-panel-muted">
              {showcase.body}
            </p>
            <ButtonLink href="#how-it-works" variant="inverted" size="md" className="mt-2">
              {showcase.cta}
              <span aria-hidden>→</span>
            </ButtonLink>
          </div>

          <div className="mt-14 sm:mt-20">
            <AppFrame title="BIO 201 — Chapter 9: Cellular Respiration.pdf">
              <div className="p-4 sm:p-6">
                <ConceptMap />
              </div>
            </AppFrame>
          </div>

          {/* The frame bleeds off the bottom edge of the panel. */}
          <div className="h-2 sm:h-4" />
        </div>
      </Container>
    </section>
  );
}
