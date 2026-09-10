import { cardVariants } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/ui/section";
import { testimonials, testimonialsSection } from "@/lib/content";

/**
 * Three quotes on three cards. Each is a `figure` with the quote as its
 * `blockquote` and the speaker as its caption — the markup a quotation
 * actually has — so it takes the card's classes rather than the `Card`
 * element. The initial in a disc stands in for a photograph we would
 * rather not ask people for.
 */
export function Testimonials() {
  return (
    <Section width="default">
      <SectionHeading
        eyebrow={testimonialsSection.eyebrow}
        title={testimonialsSection.heading}
        align="center"
      />

      <div className="mt-14 grid gap-4 lg:grid-cols-3">
        {testimonials.map((t) => (
          <figure
            key={t.name}
            className={cardVariants({
              radius: "lg",
              className: "flex flex-col p-7",
            })}
          >
            <svg
              viewBox="0 0 24 18"
              width="22"
              height="17"
              aria-hidden
              className="text-primary"
            >
              <path
                d="M0 18V9.6C0 4.3 3.2 0.9 8.6 0v3.4C5.9 4.1 4.5 5.7 4.4 8.2H8.6V18H0zm15.4 0V9.6C15.4 4.3 18.6 0.9 24 0v3.4c-2.7 0.7-4.1 2.3-4.2 4.8H24V18h-8.6z"
                fill="currentColor"
              />
            </svg>
            <blockquote className="mt-5 flex-1 text-[1.0625rem] leading-relaxed text-pretty text-foreground/85">
              {t.quote}
            </blockquote>
            <figcaption className="mt-7 flex items-center gap-3 border-t border-border pt-5">
              <span
                aria-hidden
                className="flex size-9 items-center justify-center rounded-full bg-accent text-[0.8125rem] font-semibold text-accent-foreground"
              >
                {t.name[0]}
              </span>
              <span className="flex flex-col">
                <span className="text-[0.875rem] font-medium text-foreground">
                  {t.name}
                </span>
                <span className="text-[0.8125rem] text-muted-foreground">
                  {t.role}
                </span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}
