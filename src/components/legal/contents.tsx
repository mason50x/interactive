import Link from "next/link";
import type { LegalSection } from "@/lib/legal";

/**
 * The contents rail beside a legal document.
 *
 * One entry per clause, numbered from its position to match the headings,
 * and a link to the other document at the foot. It sticks while the article
 * scrolls, but the sticking is on an inner block rather than the `aside`
 * itself: a grid item stretches to the row's full height, and a box already
 * as tall as its scroll range has nowhere to stick to.
 */
export function LegalContents({
  sections,
  sibling,
  className,
}: {
  sections: readonly LegalSection[];
  /** The other document, for the link at the foot of the list. */
  sibling: { title: string; href: string };
  className?: string;
}) {
  return (
    <aside className={className}>
      <div className="lg:sticky lg:top-24">
        <p className="text-[0.8125rem] font-medium text-faint">Contents</p>
        <ol className="mt-4 flex flex-col gap-2 border-l border-border">
          {sections.map((section, i) => (
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
  );
}
