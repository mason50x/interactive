import { CheckIcon } from "@heroicons/react/16/solid";
import { pricing, pricingSection } from "@/lib/content";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { cn } from "@/lib/utils";

export function Pricing() {
  return (
    <Section id="pricing" className="border-t border-border bg-surface">
      <Container>
        <SectionHeading
          eyebrow={pricingSection.eyebrow}
          title={pricingSection.heading}
          body={pricingSection.body}
          align="center"
        />

        <div className="mx-auto mt-14 grid max-w-5xl gap-4 lg:grid-cols-3">
          {pricing.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-[1.25rem] border p-7 sm:p-8",
                plan.featured
                  ? "border-primary bg-background shadow-[0_24px_60px_-32px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
                  : "border-border bg-background",
              )}
            >
              {plan.featured ? (
                <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-[0.75rem] font-medium text-primary-foreground">
                  Most popular
                </span>
              ) : null}

              <h3 className="text-[1rem] font-semibold text-foreground">
                {plan.name}
              </h3>
              <p className="mt-1 text-[0.9375rem] text-muted-foreground">
                {plan.body}
              </p>

              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="text-display text-[2.75rem] text-foreground">
                  {plan.price}
                </span>
                <span className="text-[0.875rem] text-faint">
                  {plan.cadence}
                </span>
              </p>

              <ul className="mt-7 flex flex-1 flex-col gap-3 border-t border-border pt-7">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2.5 text-[0.9375rem] text-foreground/85"
                  >
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>

              <ButtonLink
                href={plan.href}
                variant={plan.featured ? "primary" : "outline"}
                size="md"
                className="mt-8 w-full"
              >
                {plan.cta}
              </ButtonLink>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-[0.8125rem] text-faint">
          Prices in US dollars. Scholar is billed monthly or annually; every
          plan includes source citations.
        </p>
      </Container>
    </Section>
  );
}
