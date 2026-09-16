import { DotBand } from "@/components/landing/dot-band";
import { ProductMock } from "@/components/landing/product-mock";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { hero } from "@/lib/content";

/**
 * The opening band: the headline with its one serif
 * word, the lede, the call to action, and the product underneath.
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
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <h1
            id="hero-heading"
            className="text-display text-[clamp(1.25rem,6.5vw,4.75rem)] text-balance text-foreground"
          >
            {hero.headline}{" "}
            <span className="serif-accent text-primary">
              {hero.headlineAccent}
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground sm:text-[1.1875rem]">
            {hero.body}
          </p>

          <ButtonLink
            href="/auth/sign-up"
            size="xl"
            className="mt-9 w-full sm:w-auto"
          >
            {hero.primaryCta}
          </ButtonLink>
        </div>
      </Container>

      <Container width="wide" className="mt-14 sm:mt-20">
        <ProductMock className="animate-rise-in" />
      </Container>
    </Section>
  );
}
