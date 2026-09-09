import { features, featuresSection } from "@/lib/content";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { cn } from "@/lib/utils";
import { FeatureVisual } from "./feature-visuals";

export function Features() {
  return (
    <Section id="product" className="border-t border-border">
      <Container>
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
                "group flex flex-col overflow-hidden rounded-[1.25rem] border border-border bg-surface shadow-card transition-[border-color,box-shadow] duration-300 hover:border-border-strong hover:shadow-card-hover",
                feature.span && "sm:col-span-2",
              )}
            >
              <div className="flex h-[200px] items-center justify-center border-b border-border bg-dots p-5 [mask-image:none]">
                <div className={cn("h-full w-full", feature.span ? "max-w-[460px]" : "max-w-[360px]")}>
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
      </Container>
    </Section>
  );
}
