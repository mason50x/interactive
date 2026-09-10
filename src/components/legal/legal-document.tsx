import { LegalBlocks } from "@/components/legal/blocks";
import { BackLink } from "@/components/legal/back-link";
import { LegalContents } from "@/components/legal/contents";
import { HashLanding } from "@/components/legal/hash-landing";
import { Section } from "@/components/ui/section";
import {
  formatLegalDate,
  LEGAL_UPDATED,
  type LegalDocument as Doc,
} from "@/lib/legal";

/**
 * The reader for both legal documents.
 *
 * A column of type with a contents list beside it, and nothing else. There
 * is no card, no panel, and no accent — everything a legal page adds is
 * something between the reader and the words they are here to check, so the
 * design budget goes on the measure, the leading, and the space between
 * sections. The contents column is the one addition, because a reader who
 * arrives to check clause seven should not have to scroll past six.
 *
 * Sections are numbered from their position and anchored by their `id`, so a
 * clause can be linked to and landed on. `scroll-mt` on the heading is what
 * keeps a linked clause from arriving flush against the header.
 *
 * No prose lives here. Every sentence comes from `src/lib/legal.ts`; see the
 * note at the top of that file for why that separation is not cosmetic.
 */
export function LegalDocument({
  doc,
  sibling,
}: {
  doc: Doc;
  /** The other document, for the link at the foot of the contents. */
  sibling: { title: string; href: string };
}) {
  return (
    // A document, not a marketing band, so it sits closer to the header than
    // any of `Section`'s rhythms would put it.
    <Section width="default" className="py-10 sm:py-14 lg:py-20">
      <HashLanding />
      <BackLink />

      <div className="mt-8 grid gap-12 lg:mt-12 lg:grid-cols-12 lg:gap-16">
        <LegalContents
          sections={doc.sections}
          sibling={sibling}
          className="lg:col-span-4 xl:col-span-3"
        />

        <article className="max-w-2xl lg:col-span-8 xl:col-span-7 xl:col-start-5">
          <header className="flex flex-col gap-5">
            <h1 className="text-serif-display text-[2.5rem] text-foreground sm:text-[3.25rem]">
              {doc.title}
            </h1>
            <p className="text-[0.8125rem] text-faint">
              Last updated {formatLegalDate(LEGAL_UPDATED)}
            </p>
            <p className="text-[1.0625rem] leading-relaxed text-muted-foreground">
              {doc.lede}
            </p>
          </header>

          <div className="mt-14 flex flex-col gap-12 border-t border-border pt-12 sm:gap-14">
            {/* Each clause is a raw `<section>` on purpose: these are the
                parts of one document, not bands of a page, and `Section`'s
                rhythm would put a screen of air between them. */}
            {doc.sections.map((section, i) => (
              <section key={section.id} className="flex flex-col gap-4">
                <h2
                  id={section.id}
                  className="scroll-mt-24 text-[1.125rem] font-semibold text-balance text-foreground"
                >
                  {/* The number is part of the heading rather than a marker
                      beside it: a reader quoting a clause back to us should
                      be able to select "7. Copyright complaints" in one go. */}
                  <span className="text-faint">{i + 1}.</span> {section.heading}
                </h2>
                <LegalBlocks blocks={section.blocks} />
              </section>
            ))}
          </div>
        </article>
      </div>
    </Section>
  );
}
