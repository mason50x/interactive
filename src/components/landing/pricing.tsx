import { CheckIcon } from "@heroicons/react/16/solid";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/ui/section";
import { pricing, pricingSection } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * The three plans. The featured one is edged in the brand colour and given
 * a tinted shadow of its own; the other two sit flat on the surface, which
 * is why they cancel the card's resting shadow.
 *
 * The feature bullets are a bare tick in the brand colour rather than
 * `CheckList`'s disc: on a plan card the tick is a mark against a line item,
 * not a bullet in an argument, and the disc would make three columns of
 * them the loudest thing in the band.
 */
export function Pricing() {
  return (
    <Section id="pricing" divider width="default" className="bg-surface">
      <SectionHeading
        eyebrow={pricingSection.eyebrow}
        title={pricingSection.heading}
        body={pricingSection.body}
        align="center"
      />

      <div className="mx-auto mt-14 grid max-w-5xl gap-4 lg:grid-cols-3">
        {pricing.map((plan) => (
          <Card
            key={plan.name}
            radius="lg"
            surface="background"
            className={cn(
              "relative flex flex-col p-7 sm:p-8",
              plan.featured
                ? "border-primary shadow-[0_24px_60px_-32px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
                : "shadow-none",
            )}
          >
            {plan.featured ? (
              <Badge size="md" className="absolute -top-3 left-7">
                Most popular
              </Badge>
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
              <span className="text-[0.875rem] text-faint">{plan.cadence}</span>
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
          </Card>
        ))}
      </div>

      <p className="mt-8 text-center text-[0.8125rem] text-faint">
        Prices in US dollars. Scholar is billed monthly or annually; every plan
        includes source citations.
      </p>
    </Section>
  );
}
