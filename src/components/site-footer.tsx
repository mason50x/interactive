import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";

const legal = [
  { label: "Privacy", href: "/pp" },
  { label: "Terms", href: "/tos" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container className="py-12 sm:py-20">
        <div className="flex flex-col gap-5">
          <Link href="/" aria-label={`${brand.name} home`} className="-my-2.5 w-fit py-2.5">
            <Wordmark className="text-[1.25rem]" />
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            {brand.tagline}. Built with learning scientists, for people who are
            done re-reading.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-8 sm:mt-14 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-xs text-faint">
            © {new Date().getFullYear()} {brand.name}. All rights reserved.
          </p>
          {/* `-my-3 py-3` gives each link a thumb-sized target without
              moving it: bare 12px text is a 16px-tall thing to hit. */}
          <div className="-my-3 flex gap-6">
            {legal.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="py-3 text-xs text-faint transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
