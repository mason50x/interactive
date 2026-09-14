/**
 * The foot of every marketing page: the lockup and the blurb on the left,
 * the link columns on the right, and the legal line under both. The copy
 * comes from `src/lib/content.ts` so the footer and the pages it links say
 * the same names.
 */
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import { footer } from "@/lib/content";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container>
        <div className="grid gap-12 py-16 md:grid-cols-12 md:gap-8">
          <div className="flex max-w-sm flex-col gap-5 md:col-span-5">
            <Link href="/" aria-label={`${brand.name} home`} className="w-fit">
              <Wordmark className="text-[1.125rem]" />
            </Link>
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
              {footer.blurb}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7 md:justify-items-end">
            {footer.columns.map((column) => (
              <div
                key={column.heading}
                className="flex min-w-[8rem] flex-col gap-4"
              >
                <p className="text-[0.875rem] font-semibold text-foreground">
                  {column.heading}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border py-6 text-[0.8125rem] text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {brand.name}. All rights reserved.
          </p>
          <p>Made for people who want to understand, not just remember.</p>
        </div>
      </Container>
    </footer>
  );
}
