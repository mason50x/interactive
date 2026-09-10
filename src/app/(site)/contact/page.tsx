import type { Metadata } from "next";
import { ArrowUpRightIcon } from "@heroicons/react/16/solid";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
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
      <section className="relative overflow-hidden pt-14 sm:pt-20 lg:pt-24">
        <div
          aria-hidden
          className="bg-dots pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.6),transparent)]"
        />
        <Container>
          <div className="flex max-w-3xl flex-col items-start gap-5">
            <Eyebrow>{contact.eyebrow}</Eyebrow>
            <h1 className="text-display text-[2.5rem] text-balance text-foreground sm:text-[3.5rem] lg:text-[4.25rem]">
              {contact.heading}
            </h1>
            <p className="max-w-2xl text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground sm:text-[1.1875rem]">
              {contact.lede}
            </p>
          </div>
        </Container>
      </section>

      <section className="py-14 sm:py-20">
        <Container>
          <div className="grid gap-4 sm:grid-cols-2">
            {contact.channels.map((channel) => (
              <a
                key={channel.label}
                href={`mailto:${channel.value}`}
                className="group flex flex-col gap-3 rounded-[1.25rem] border border-border bg-surface p-6 shadow-card transition-[border-color,box-shadow] duration-300 hover:border-border-strong hover:shadow-card-hover"
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
        </Container>
      </section>

      <section className="border-t border-border bg-surface py-16 sm:py-24">
        <Container>
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
        </Container>
      </section>
    </>
  );
}
