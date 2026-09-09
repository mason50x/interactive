import { Container } from "@/components/ui/container";
import { trust } from "@/lib/content";

/**
 * The row of names under the hero. Set as type rather than logos: six marks
 * in six brand colours would be the loudest thing on the page, and the point
 * of the row is to be believed, not noticed.
 */
export function TrustStrip() {
  return (
    <section className="py-14 sm:py-16">
      <Container>
        <p className="text-center text-[0.875rem] text-faint">{trust.label}</p>
        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 sm:gap-x-14">
          {trust.names.map((name) => (
            <li
              key={name}
              className="text-serif-display text-[1.375rem] text-muted-foreground/80 sm:text-[1.5rem]"
            >
              {name}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
