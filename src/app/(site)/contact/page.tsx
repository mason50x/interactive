import type { Metadata } from "next";
import { ArrowUpRightIcon } from "@heroicons/react/16/solid";
import { DotBand } from "@/components/landing/dot-band";
import { ButtonLink } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { Eyebrow, PageIntro, Section } from "@/components/ui/section";
import { contact } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "How to reach the Interactive Learning team: support, schools and districts, press, and privacy.",
};

export default function ContactPage() {
  const schools = contact.channels[1];

  return (
    <>
      {/* No padding below the intro: the channel grid's band supplies it. */}
      <Section
        rhythm="hero"
        width="default"
        className="relative overflow-hidden pb-0 sm:pb-0 lg:pb-0"
      >
        <DotBand height="32rem" />
        <PageIntro
          eyebrow={contact.eyebrow}
          title={contact.heading}
          body={contact.lede}
        />
      </Section>

      <Section width="default" className="py-14 sm:py-20 lg:py-20">
        <div className="grid gap-4 sm:grid-cols-2">
          {contact.channels.map((channel) => (
            // Each channel is a link to its address, so it takes the card's
            // classes on an `a` rather than the `Card` element.
            <a
              key={channel.label}
              href={`mailto:${channel.value}`}
              className={cardVariants({
                radius: "lg",
                hover: "glow",
                className: "group flex flex-col gap-3 p-6",
              })}
            >
              <div className="flex items-center justify-between">
                <p className="text-[0.875rem] font-medium text-muted-foreground">
                  {channel.label}
                </p>
                <ArrowUpRightIcon className="size-4 text-faint transition-colors group-hover:text-foreground" />
              </div>
              <p className="text-[1.125rem] font-semibold break-words text-foreground">
                {channel.value}
              </p>
              <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
                {channel.note}
              </p>
            </a>
          ))}
        </div>
        <p className="mt-6 text-[0.875rem] text-faint">{contact.hours}</p>
      </Section>

      <Section
        divider
        width="default"
        className="bg-surface py-16 sm:py-24 lg:py-24"
      >
        <div className="grid items-center gap-8 rounded-[1.5rem] bg-panel p-8 text-panel-foreground sm:p-12 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-8">
            <Eyebrow tone="inverted">For teaching teams</Eyebrow>
            <h2 className="text-display text-[1.75rem] text-balance sm:text-[2.25rem]">
              {contact.pilot.heading}
            </h2>
            <p className="max-w-2xl text-[1rem] leading-relaxed text-panel-muted">
              {contact.pilot.body}
            </p>
          </div>
          <div className="lg:col-span-4 lg:justify-self-end">
            <ButtonLink
              href={`mailto:${schools.value}?subject=Pilot%20request`}
              variant="inverted"
              size="xl"
            >
              {contact.pilot.cta}
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}
