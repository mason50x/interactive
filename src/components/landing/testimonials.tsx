import { testimonials } from "@/lib/content";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";

export function Testimonials() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="From the beta"
          title="What changed for them"
          align="center"
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {testimonials.map((t) => (
            <Card key={t.name} interactive className="flex flex-col p-8">
              <svg viewBox="0 0 24 18" width="26" height="20" aria-hidden className="text-primary">
                <path
                  d="M0 18V9.6C0 4.3 3.2 0.9 8.6 0v3.4C5.9 4.1 4.5 5.7 4.4 8.2H8.6V18H0zm15.4 0V9.6C15.4 4.3 18.6 0.9 24 0v3.4c-2.7 0.7-4.1 2.3-4.2 4.8H24V18h-8.6z"
                  fill="currentColor"
                />
              </svg>
              <blockquote className="mt-5 flex-1 text-[1.0625rem] leading-relaxed text-foreground/85">
                {t.quote}
              </blockquote>
              <footer className="mt-7 border-t border-border pt-5">
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{t.role}</p>
              </footer>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}
