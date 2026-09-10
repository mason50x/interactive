import { FeatureVisual } from "@/components/landing/feature-visuals";
import { cardVariants } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/ui/section";
import { features, featuresSection } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * The grid of what the product does, one card per feature with its drawing
 * on top. A feature can span two columns; the drawing inside is capped at a
 * width that suits the card it gets, so the wide one is not just a stretched
 * copy of the narrow ones.
 *
 * Each card is an `article` — a self-contained thing with its own heading —
 * so it takes the card's classes rather than the `Card` element.
 */
export function Features() {
  return (
    <Section id="product" divider width="default">
      <SectionHeading
        eyebrow={featuresSection.eyebrow}
        title={featuresSection.heading}
        body={featuresSection.body}
      />

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <article
            key={feature.id}
            className={cn(
              cardVariants({ radius: "lg", hover: "glow" }),
              "group flex flex-col overflow-hidden",
              feature.span && "sm:col-span-2",
            )}
          >
            <div className="bg-dots flex h-[200px] items-center justify-center border-b border-border [mask-image:none] p-5">
              <div
                className={cn(
                  "h-full w-full",
                  feature.span ? "max-w-[460px]" : "max-w-[360px]",
                )}
              >
                <FeatureVisual name={feature.visual} />
              </div>
            </div>
            <div className="flex flex-col gap-2 p-6">
              <h3 className="text-[1.0625rem] font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
                {feature.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
