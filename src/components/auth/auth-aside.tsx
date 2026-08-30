import Link from "next/link";
import { ConceptMap } from "@/components/visuals/concept-map";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import { authAside } from "@/lib/content";

function Tick() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-primary"
      aria-hidden
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

/**
 * The informational half of the `/auth` split screen.
 *
 * It sits on the inverted panel, which is dark in both themes — so the form
 * beside it is the only thing on the page that changes colour when the theme
 * does, and the seam between the two halves reads the same either way.
 *
 * Below `lg` there is no room for two columns, so the whole aside is dropped
 * rather than stacked above the form: on a phone the form is the entire job.
 */
export function AuthAside() {
  return (
    <aside className="relative hidden overflow-hidden bg-panel px-12 py-14 lg:flex lg:flex-col lg:justify-between xl:px-16">
      {/* A real concept map, bled off the bottom edge and faded out, rather
          than abstract decoration — it is the thing being signed up for. */}
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute -right-40 -bottom-72 w-[46rem] opacity-25 [mask-image:linear-gradient(to_top,transparent_18%,black_85%)]"
      >
        <ConceptMap />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_65%_at_10%_-10%,rgba(60,133,247,0.22),transparent_65%)]"
      />

      <Link
        href="/"
        aria-label={`${brand.name} home`}
        className="relative w-fit rounded-full transition-opacity hover:opacity-80"
      >
        <Wordmark tone="inverted" className="text-[1.1875rem]" />
      </Link>

      <div className="relative max-w-md pt-16">
        <p className="label-small text-panel-muted">{authAside.eyebrow}</p>
        <p className="text-display mt-6 text-[2.5rem] whitespace-pre-line text-panel-foreground xl:text-[2.875rem]">
          {authAside.headline}
        </p>
        <p className="mt-6 max-w-sm text-[1.0625rem] leading-relaxed text-panel-muted">
          {authAside.body}
        </p>

        <ul className="mt-9 flex flex-col gap-3.5">
          {authAside.points.map((point) => (
            <li
              key={point}
              className="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-panel-foreground/85"
            >
              <Tick />
              {point}
            </li>
          ))}
        </ul>
      </div>

      <figure className="relative mt-16 max-w-md border-l-2 border-panel-border pl-5">
        <blockquote className="text-[0.9375rem] leading-relaxed text-panel-foreground/85">
          “{authAside.quote.text}”
        </blockquote>
        <figcaption className="mt-3 text-[0.8125rem] text-panel-muted">
          <span className="text-panel-foreground/70">{authAside.quote.name}</span>
          {" · "}
          {authAside.quote.role}
        </figcaption>
      </figure>
    </aside>
  );
}
