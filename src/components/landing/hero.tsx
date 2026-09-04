import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { ButtonLink } from "@/components/ui/button";
import { LearningScene } from "./learning-scene";
import { RotatingWord } from "./rotating-word";
import styles from "./landing.module.css";

export function Hero() {
  return (
    <section
      className={`${styles.container} ${styles.hero}`}
      aria-labelledby="hero-heading"
    >
      <div className={styles.heroCopy}>
        <h1 id="hero-heading" aria-label="The new way of Learning, Planning, Organizing.">
          <span><b className={styles.headlineText}>The new way</b></span>
          <span><b className={styles.headlineText}>of </b><RotatingWord /></span>
        </h1>
        <p>
          A little curiosity. A little practice. See where it takes you.
        </p>
        <div className={styles.actions}>
          <ButtonLink
            href="/auth/sign-up"
            size="xl"
            className={styles.waitlistButton}
          >
            Join the Waitlist
          </ButtonLink>
          <ButtonLink
            href="/auth/sign-in"
            variant="link"
            size="xl"
            className="gap-2 text-foreground"
          >
            Sign in
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </ButtonLink>
        </div>
      </div>
      <LearningScene />
    </section>
  );
}
