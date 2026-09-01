import { showcase } from "@/lib/content";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { AppFrame } from "@/components/visuals/app-frame";
import { ConceptMap } from "@/components/visuals/concept-map";

export function Showcase() {
  return (
    <section id="platform" className="pt-14 pb-14 sm:pt-28 sm:pb-28">
      <Container>
        {/* The panel's inset is trimmed on a phone: every pixel taken here is
            a pixel the concept map inside does not get, and it is the one
            thing on this page that needs the width. The container's own
            padding is left alone so the panel edge still lines up with the
            hero above it. */}
        <div className="overflow-hidden rounded-[1.5rem] bg-panel px-4 pt-12 pb-6 sm:rounded-[2rem] sm:px-10 sm:pt-24 sm:pb-8 lg:px-16">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center sm:gap-6">
            <h2 className="text-serif-display text-[2.125rem] text-panel-foreground min-[400px]:text-[2.5rem] sm:text-[3.5rem] lg:text-[4rem]">
              {showcase.heading.split("\n").map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </h2>
            <p className="max-w-xl text-[1rem] leading-relaxed text-panel-muted sm:text-[1.0625rem]">
              {showcase.body}
            </p>
            <ButtonLink href="#how-it-works" variant="inverted" size="md" className="mt-2">
              {showcase.cta}
              <span aria-hidden>→</span>
            </ButtonLink>
          </div>

          <div className="mt-10 sm:mt-20">
            <AppFrame title="BIO 201 — Chapter 9: Cellular Respiration.pdf">
              <div className="p-3 sm:p-6">
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
