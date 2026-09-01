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
 * It is deliberately the plainest thing in the codebase. There is no header,
 * no footer, no card, no panel, and no accent — the page is a column of type
 * and a way out, because everything a legal page adds is something between
 * the reader and the words they are here to check. The whole design budget
 * goes on the measure, the leading, and the space between sections.
 *
 * Sections are numbered from their position and anchored by their `id`, so a
 * clause can be linked to and landed on. `scroll-mt` on the heading is what
 * keeps a linked clause from arriving flush against the top of the viewport.
 *
 * No prose lives here. Every sentence comes from `src/lib/legal.ts`; see the
 * note at the top of that file for why that separation is not cosmetic.
 */
export function LegalDocument({ doc }: { doc: Doc }) {
  return (
    <div className="min-h-dvh py-8 sm:py-12">
      <HashLanding />
      <Container width="prose">
        <BackLink />

        <article className="mt-10 sm:mt-14">
          <header className="flex flex-col gap-5">
            <h1 className="text-serif-display text-[2.125rem] min-[400px]:text-[2.5rem] sm:text-[3rem] text-foreground">
              {doc.title}
            </h1>
            <p className="text-[0.8125rem] text-faint">
              Last updated {formatLegalDate(LEGAL_UPDATED)}
            </p>
            <p className="text-[1.0625rem] leading-relaxed text-muted-foreground">
              {doc.lede}
            </p>
          </header>

          <div className="mt-16 flex flex-col gap-14 sm:gap-16">
            {doc.sections.map((section, i) => (
              <section key={section.id} className="flex flex-col gap-4">
                <h2
                  id={section.id}
                  className="scroll-mt-8 text-[1.0625rem] font-semibold text-balance text-foreground"
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
      </Container>
    </div>
  );
}
