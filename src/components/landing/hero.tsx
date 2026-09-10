import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/16/solid";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { hero } from "@/lib/content";
import { ProductMock } from "./product-mock";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden pt-14 sm:pt-20 lg:pt-24"
    >
      {/* Ground: a dot lattice fading out under the copy, and one wash of
          brand colour behind the product. */}
      <div
        aria-hidden
        className="bg-dots pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42rem] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.6),transparent)]"
      />
      <div
        aria-hidden
        className="bg-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60rem]"
      />

      <Container>
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Link
            href={hero.announcementHref}
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-3 pl-1.5 text-[0.8125rem] text-muted-foreground shadow-card transition-colors hover:border-border-strong hover:text-foreground"
          >
            <span className="rounded-full bg-primary px-2 py-0.5 text-[0.75rem] font-medium text-primary-foreground">
              New
            </span>
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

          <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <ButtonLink
              href="/auth/sign-up"
              size="xl"
              className="w-full sm:w-auto"
            >
              {hero.primaryCta}
            </ButtonLink>
            <ButtonLink
              href="#how-it-works"
              variant="outline"
              size="xl"
              className="w-full gap-2 sm:w-auto"
            >
              {hero.secondaryCta}
              <ArrowRightIcon className="size-4 text-faint" />
            </ButtonLink>
          </div>
          <p className="mt-4 text-[0.8125rem] text-faint">{hero.footnote}</p>
        </div>
      </Container>

      <Container width="wide" className="mt-14 sm:mt-20">
        <ProductMock className="animate-rise-in" />
      </Container>
    </section>
  );
}
