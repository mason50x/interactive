import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";

const social = [
  { label: "X", href: "#" },
  { label: "LinkedIn", href: "#" },
  { label: "YouTube", href: "#" },
  { label: "GitHub", href: "#" },
];

const legal = [
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container className="py-16 sm:py-20">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-5">
            <Link href="/" aria-label={`${brand.name} home`}>
              <Wordmark className="text-[1.25rem]" />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {brand.tagline}. Built with learning scientists, for people who
              are done re-reading.
            </p>
          </div>

          <div className="flex gap-5 sm:pt-1">
            {social.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint">
            © {new Date().getFullYear()} Cognify. All rights reserved.
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
