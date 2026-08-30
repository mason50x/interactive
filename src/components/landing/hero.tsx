import { SignUpButton } from "@clerk/nextjs";
import { hero } from "@/lib/content";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { MarkedText } from "./marked-text";

export function Hero() {
  return (
    <section className="pt-16 pb-14 sm:pt-24 sm:pb-20 lg:pt-28">
      <Container>
        <h1 className="text-display animate-rise-in max-w-3xl text-balance text-[2rem] sm:text-[2.75rem] lg:text-[3.25rem] xl:text-[3.5rem]">
          <MarkedText text={hero.headline} />
        </h1>

        <div
          className="animate-rise-in mt-10 flex flex-col gap-4 sm:flex-row sm:items-center"
          style={{ animationDelay: "120ms" }}
        >
          <SignUpButton>
            <Button size="xl">{hero.primaryCta}</Button>
          </SignUpButton>
          <ButtonLink href="#platform" variant="secondary" size="xl">
            {hero.secondaryCta}
            <span aria-hidden>↓</span>
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
