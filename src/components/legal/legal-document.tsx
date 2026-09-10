import Link from "next/link";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/legal/back-link";
import { HashLanding } from "@/components/legal/hash-landing";
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
    <div className="py-10 sm:py-14 lg:py-20">
      <HashLanding />
      <Container>
        <BackLink />

        <div className="mt-8 grid gap-12 lg:mt-12 lg:grid-cols-12 lg:gap-16">
          <aside className="lg:col-span-4 xl:col-span-3">
            <div className="lg:sticky lg:top-24">
              <p className="text-[0.8125rem] font-medium text-faint">
                Contents
              </p>
              <ol className="mt-4 flex flex-col gap-2 border-l border-border">
                {doc.sections.map((section, i) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="-ml-px flex gap-3 border-l border-transparent py-0.5 pl-4 text-[0.875rem] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                    >
                      <span className="w-5 shrink-0 text-faint">{i + 1}.</span>
                      <span className="text-balance">{section.heading}</span>
                    </a>
                  </li>
                ))}
              </ol>
              <p className="mt-8 text-[0.875rem] text-muted-foreground">
                See also the{" "}
                <Link
                  href={sibling.href}
                  className="text-foreground underline underline-offset-4 hover:text-primary"
                >
                  {sibling.title}
                </Link>
                .
              </p>
            </div>
          </aside>

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
              {doc.sections.map((section, i) => (
                <section key={section.id} className="flex flex-col gap-4">
                  <h2
                    id={section.id}
                    className="scroll-mt-24 text-[1.125rem] font-semibold text-balance text-foreground"
                  >
                    {/* The number is part of the heading rather than a marker
                        beside it: a reader quoting a clause back to us should
                        be able to select "7. Copyright complaints" in one go. */}
                    <span className="text-faint">{i + 1}.</span>{" "}
                    {section.heading}
                  </h2>

                  {/* `break-words` on both block kinds: the prose names
                      contact addresses, and an email is a single unbreakable
                      token long enough to push a 320px page sideways. */}
                  {section.blocks.map((block, j) =>
                    block.kind === "p" ? (
                      <p
                        key={j}
                        className="text-[1rem] leading-[1.75] break-words text-muted-foreground"
                      >
                        {block.text}
                      </p>
                    ) : (
                      <ul
                        key={j}
                        className="flex list-disc flex-col gap-2.5 pl-5 marker:text-faint"
                      >
                        {block.items.map((item) => (
                          <li
                            key={item}
                            className="pl-1 text-[1rem] leading-[1.75] break-words text-muted-foreground"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                    ),
                  )}
                </section>
              ))}
            </div>
          </article>
        </div>
      </Container>
    </div>
  );
}
