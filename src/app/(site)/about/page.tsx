import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
import { about } from "@/lib/content";

export const metadata: Metadata = {
  title: "About",
  description:
    "Who builds Interactive Learning, why it exists, and the principles behind every map.",
};

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-14 sm:pt-20 lg:pt-24">
        <div
          aria-hidden
          className="bg-dots pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.6),transparent)]"
        />
        <Container>
          <div className="flex max-w-3xl flex-col items-start gap-5">
            <Eyebrow>{about.eyebrow}</Eyebrow>
            <h1 className="text-display text-[2.5rem] text-balance text-foreground sm:text-[3.5rem] lg:text-[4.25rem]">
              {about.heading}
            </h1>
            <p className="max-w-2xl text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground sm:text-[1.1875rem]">
              {about.lede}
            </p>
          </div>

          <dl className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-border py-10 sm:mt-20 lg:grid-cols-4">
            {about.facts.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-1.5">
                <dt className="text-display text-[2.25rem] text-foreground sm:text-[2.75rem]">
                  {fact.value}
                </dt>
                <dd className="text-[0.9375rem] text-muted-foreground">
                  {fact.label}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container>
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
        </Container>
      </section>

      <section className="border-t border-border bg-surface py-16 sm:py-24">
        <Container>
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <h2 className="text-display text-[1.75rem] text-foreground sm:text-[2rem]">
                What we hold to
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
              {about.principles.map((principle, i) => (
                <div
                  key={principle.title}
                  className="flex flex-col gap-2 rounded-[1.25rem] border border-border bg-background p-6"
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
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-border py-16 sm:py-24">
        <Container>
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2">
              <h2 className="text-display text-[1.75rem] text-foreground sm:text-[2rem]">
                Want to see it on your own material?
              </h2>
              <p className="text-[1rem] text-muted-foreground">
                The beta is by invitation. Ask a member, or request a pilot for
                a whole class.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/auth/sign-up" size="md">
                Get started
              </ButtonLink>
              <ButtonLink href="/contact" variant="outline" size="md">
                Contact us
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
