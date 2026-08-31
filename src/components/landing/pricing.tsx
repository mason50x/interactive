import { SignUpButton } from "@clerk/nextjs";
import { pricing } from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";

export function Pricing() {
  return (
    <Section id="pricing" className="border-t border-border">
      <Container>
        <SectionHeading
          eyebrow="Pricing"
          title="Free while you are a student"
          body="Upgrade when you need more than five maps a month. Cancel from the account page in one click."
          align="center"
        />

        <div className="mx-auto mt-14 grid max-w-5xl gap-5 lg:grid-cols-3">
          {pricing.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-[1.5rem] border p-8 transition-all duration-300 ${
                plan.featured
                  ? "border-primary bg-surface shadow-[0_24px_60px_-32px_color-mix(in_oklab,var(--primary)_55%,transparent)] lg:-my-3 lg:py-11"
                  : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              {plan.featured ? (
                <span className="absolute -top-3 left-8 rounded-full bg-primary px-3 py-1 text-[0.6875rem] font-medium text-primary-foreground">
                  Most popular
                </span>
              ) : null}

              <h3 className="text-sm font-semibold text-foreground">
                {plan.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.body}</p>

              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="text-display text-[2.75rem] text-foreground">
                  {plan.price}
                </span>
                <span className="text-sm text-faint">{plan.cadence}</span>
              </p>

              <ul className="mt-7 flex flex-1 flex-col gap-3 border-t border-border pt-7">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[0.9375rem] text-foreground/80">
                    <span className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {f}
                  </li>
                ))}
              </ul>

              <SignUpButton>
                <Button
                  variant={plan.featured ? "primary" : "secondary"}
                  size="xl"
                  className="mt-8 w-full"
                >
                  {plan.cta}
                </Button>
              </SignUpButton>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
