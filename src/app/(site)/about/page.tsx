/** Who makes this and why, told in three bands. */
import type { Metadata } from "next";
import { CtaPair } from "@/components/landing/cta-pair";
import { DotBand } from "@/components/landing/dot-band";
import { StatList } from "@/components/landing/stat-list";
import { Card } from "@/components/ui/card";
import { PageIntro, Section } from "@/components/ui/section";
import { about } from "@/lib/content";

export const metadata: Metadata = {
  title: "About",
  description:
    "Who builds Interactive Learning, why it exists, and the principles behind every map.",
};

export default function AboutPage() {
  return (
    <>
      {/* No padding below the intro: the ruled row of facts is its foot. */}
      <Section
        rhythm="hero"
        width="default"
        className="relative overflow-hidden pb-0 sm:pb-0 lg:pb-0"
      >
        <DotBand height="32rem" />
        <PageIntro
          eyebrow={about.eyebrow}
          title={about.heading}
          body={about.lede}
        />

        <StatList
          items={about.facts}
          className="mt-14 border-y border-border py-10 sm:mt-20"
        />
      </Section>

      <Section width="default" className="py-16 sm:py-24 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <h2 className="text-display text-[1.75rem] text-foreground sm:text-[2rem]">
              Where it started
            </h2>
          </div>
          <div className="flex flex-col gap-6 lg:col-span-7">
            {about.story.map((paragraph) => (
              <p
                key={paragraph.slice(0, 24)}
                className="text-[1.0625rem] leading-[1.75] text-pretty text-muted-foreground"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </Section>

      <Section
        divider
        width="default"
        className="bg-surface py-16 sm:py-24 lg:py-24"
      >
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <h2 className="text-display text-[1.75rem] text-foreground sm:text-[2rem]">
              What we hold to
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
            {about.principles.map((principle, i) => (
              // Flat on the surface: the page's ground shows through as the
              // card's face, so a shadow would lift what is meant to sit.
              <Card
                key={principle.title}
                radius="lg"
                surface="background"
                className="flex flex-col gap-2 p-6 shadow-none"
              >
                <span className="text-[0.8125rem] font-medium text-primary">
                  0{i + 1}
                </span>
                <h3 className="text-[1.0625rem] font-semibold text-foreground">
                  {principle.title}
                </h3>
                <p className="text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
                  {principle.body}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      <Section divider width="default" className="py-16 sm:py-24 lg:py-24">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <h2 className="text-display text-[1.75rem] text-foreground sm:text-[2rem]">
              Want to see it on your own material?
            </h2>
            <p className="text-[1rem] text-muted-foreground">
              The beta is by invitation. Ask a member, or request a pilot for a
              whole class.
            </p>
          </div>
          <CtaPair
            size="md"
            primary={{ href: "/auth/sign-up", label: "Get started" }}
            secondary={{ href: "/contact", label: "Contact us" }}
          />
        </div>
      </Section>
    </>
  );
}
