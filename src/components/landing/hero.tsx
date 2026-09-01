import { hero } from "@/lib/content";
import { AuthButton } from "@/components/auth-button";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { MarkedText } from "./marked-text";

export function Hero() {
  return (
    <section className="pt-12 pb-10 sm:pt-24 sm:pb-20 lg:pt-28">
      <Container>
        <h1 className="text-display animate-rise-in max-w-3xl text-balance text-[1.875rem] min-[400px]:text-[2rem] sm:text-[2.75rem] lg:text-[3.25rem] xl:text-[3.5rem]">
          <MarkedText text={hero.headline} />
        </h1>

        {/* Stacked and full width on a phone, where a thumb wants the whole
            measure, and a row from `sm` where two pills side by side fit. */}
        <div
          className="animate-rise-in mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center sm:gap-4"
          style={{ animationDelay: "120ms" }}
        >
          <AuthButton size="xl">{hero.primaryCta}</AuthButton>
          <ButtonLink href="#platform" variant="secondary" size="xl">
            {hero.secondaryCta}
            <span aria-hidden>↓</span>
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
