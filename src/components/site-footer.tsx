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
      <Container className="py-16 sm:py-20">
        <div className="flex flex-col gap-5">
          <Link href="/" aria-label={`${brand.name} home`}>
            <Wordmark className="text-[1.25rem]" />
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            {brand.tagline}. Built with learning scientists, for people who are
            done re-reading.
          </p>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint">
            © {new Date().getFullYear()} {brand.name}. All rights reserved.
          </p>
          <div className="flex gap-6">
            {legal.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="text-xs text-faint transition-colors hover:text-foreground"
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
