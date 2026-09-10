import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/16/solid";
import { DotBand } from "@/components/landing/dot-band";
import { CtaPair } from "@/components/landing/cta-pair";
import { ProductMock } from "@/components/landing/product-mock";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { hero } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * The opening band: the announcement chip, the headline with its one serif
 * word, the lede, the two ways in, and the product underneath.
 *
 * Two containers rather than one, because the copy sits at the page's
 * measure and the product mock deliberately runs wider than it. No padding
 * below: the trust strip's own top padding is the space under the product.
 */
export function Hero() {
  return (
    <Section
      aria-labelledby="hero-heading"
      rhythm="hero"
      className="relative overflow-hidden pb-0 sm:pb-0 lg:pb-0"
    >
      {/* Ground: a dot lattice fading out under the copy, and one wash of
          brand colour behind the product. */}
      <DotBand height="42rem" />
      <div
        aria-hidden
        className="bg-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60rem]"
      />

      <Container>
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Link
            href={hero.announcementHref}
            className={cn(
              badgeVariants({ variant: "outline" }),
              "group gap-2 py-1 pr-3 pl-1.5 text-[0.8125rem] font-normal shadow-card transition-colors hover:border-border-strong hover:text-foreground",
            )}
          >
            <Badge>New</Badge>
            {hero.announcement}
            <ArrowRightIcon className="size-3.5 text-faint transition-transform group-hover:translate-x-0.5" />
          </Link>

          <h1
            id="hero-heading"
            className="text-display mt-7 text-[2.75rem] text-balance text-foreground min-[420px]:text-[3.25rem] sm:text-[4rem] lg:text-[4.75rem]"
          >
            {hero.headline}{" "}
            <span className="serif-accent text-primary">
              {hero.headlineAccent}
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground sm:text-[1.1875rem]">
            {hero.body}
          </p>

          <CtaPair
            size="xl"
            className="mt-9 w-full items-center sm:w-auto"
            primary={{
              href: "/auth/sign-up",
              label: hero.primaryCta,
              className: "w-full sm:w-auto",
            }}
            secondary={{
              href: "#how-it-works",
              label: (
                <>
                  {hero.secondaryCta}
                  <ArrowRightIcon className="size-4 text-faint" />
                </>
              ),
              className: "w-full gap-2 sm:w-auto",
            }}
          />
          <p className="mt-4 text-[0.8125rem] text-faint">{hero.footnote}</p>
        </div>
      </Container>

      <Container width="wide" className="mt-14 sm:mt-20">
        <ProductMock className="animate-rise-in" />
      </Container>
    </Section>
  );
}
