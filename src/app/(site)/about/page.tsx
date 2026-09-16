/** Who makes this and why, told in three bands. */
import type { Metadata } from "next";
import { DotBand } from "@/components/landing/dot-band";
import { StatList } from "@/components/landing/stat-list";
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
        <PageIntro title={about.heading} body={about.lede} />

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
    </>
  );
}
