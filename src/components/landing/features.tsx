import { features } from "@/lib/content";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { FeatureVisual } from "@/components/visuals/feature-visuals";

export function Features() {
  return (
    <Section id="features">
      <Container>
        <SectionHeading
          eyebrow="The platform"
          title="Six ways a map beats a page of text"
          body="Every feature exists for one reason: to move a subject out of prose and into a form your memory can hold onto."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.id}
              interactive
              className={`flex flex-col overflow-hidden p-7 ${
                feature.span ? "sm:col-span-2 lg:col-span-2" : ""
              }`}
            >
              <div className="mb-7 flex h-[190px] items-center justify-center rounded-xl border border-border bg-background p-4">
                <FeatureVisual name={feature.visual} />
              </div>
              <h3 className="text-[1.1875rem] font-semibold tracking-tight text-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}
