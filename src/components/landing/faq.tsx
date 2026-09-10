import { PlusIcon } from "@heroicons/react/16/solid";
import { Section, SectionHeading } from "@/components/ui/section";
import { faqs, faqSection } from "@/lib/content";

/**
 * The questions, as native `details` so they open without a line of script.
 * The plus turns into a cross when one is open, which is the whole of the
 * affordance; the browser's own marker is hidden because it would be a
 * second one.
 */
export function Faq() {
  return (
    <Section id="faq" divider width="default">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <SectionHeading
            eyebrow={faqSection.eyebrow}
            title={faqSection.heading}
          />
        </div>

        <div className="lg:col-span-8">
          <div className="divide-y divide-border border-y border-border">
            {faqs.map((faq) => (
              <details key={faq.question} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[1.0625rem] font-medium text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <PlusIcon
                    aria-hidden
                    className="size-4 shrink-0 text-faint transition-transform duration-300 group-open:rotate-45"
                  />
                </summary>
                <p className="max-w-2xl pb-6 text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
