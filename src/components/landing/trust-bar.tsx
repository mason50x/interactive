import { trustBar } from "@/lib/content";
import { Container } from "@/components/ui/container";

export function TrustBar() {
  const items = [...trustBar.items, ...trustBar.items];

  return (
    <section className="border-y border-border py-10">
      <Container>
        <p className="label-small mb-6 text-center text-faint">{trustBar.label}</p>
      </Container>
      <div className="mask-fade-x overflow-hidden">
        <div className="marquee-track flex w-max items-center gap-12 pr-12">
          {items.map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="flex items-center gap-12 text-lg whitespace-nowrap text-foreground/45"
            >
              {item}
              <span className="h-1 w-1 rounded-full bg-primary/50" aria-hidden />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
