import { FilmIcon } from "@heroicons/react/24/outline";

export function EntertainmentSoon() {
  return (
    <section
      aria-label="Entertainment coming soon"
      className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <FilmIcon aria-hidden="true" className="size-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Entertainment</p>
      <h1 className="text-4xl font-semibold">SOON</h1>
    </section>
  );
}
