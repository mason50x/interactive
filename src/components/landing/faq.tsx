import { faqs } from "@/lib/content";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";

export function Faq() {
  return (
    <Section className="border-t border-border bg-surface">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <SectionHeading eyebrow="Questions" title="Before you start" />
          </div>

          <div className="lg:col-span-8">
            <div className="divide-y divide-border border-y border-border">
              {faqs.map((faq) => (
                <details key={faq.question} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-left text-[1.0625rem] font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <span
                      className="relative h-4 w-4 shrink-0 text-primary"
                      aria-hidden
                    >
                      <span className="absolute top-1/2 left-0 h-px w-4 -translate-y-1/2 bg-current" />
                      <span className="absolute top-0 left-1/2 h-4 w-px -translate-x-1/2 bg-current transition-transform duration-300 group-open:rotate-90 group-open:opacity-0" />
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-6 text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
