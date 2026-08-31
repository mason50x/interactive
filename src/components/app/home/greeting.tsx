/**
 * The top of the home page: a name, and nothing else.
 *
 * Left-aligned and large, with nothing beside it and nothing under it. A
 * dashboard that opens with a centred greeting is a splash screen; this is the
 * first line of a page, and the cards below say everything a subtitle here
 * would have said twice.
 *
 * The name is a prop and not a hook. It comes from the server render, so it is
 * in the first HTML rather than appearing a beat later once Clerk's client has
 * loaded — a greeting that says "Welcome back" and then adds your name is a
 * greeting that reads as broken twice a day.
 */
export function HomeGreeting({ name }: { name: string | null }) {
  return (
    <h1 className="text-display text-display-title text-[2.25rem] sm:text-[2.75rem]">
      Welcome back{name ? <>, {name}</> : ""}
    </h1>
  );
}
