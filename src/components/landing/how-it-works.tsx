import { steps } from "@/lib/content";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";

export function HowItWorks() {
  return (
    <Section id="how-it-works" className="border-t border-border bg-surface">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="Three steps, about two minutes"
          body="No setup, no template picking, no tagging. Bring the material you already have."
        />

        <ol className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
          {steps.map((step) => (
            <li key={step.number} className="group relative bg-surface p-8 lg:p-10">
              <span className="label-small text-primary">{step.number}</span>
              <h3 className="mt-5 text-[1.375rem] font-semibold tracking-tight text-foreground">
                {step.title}
              </h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
                {step.body}
              </p>
              <span
                className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100"
                aria-hidden
              />
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
