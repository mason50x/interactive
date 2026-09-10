import { PageTitle } from "@/components/ui/page";

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
  return <PageTitle>Welcome back{name ? <>, {name}</> : ""}</PageTitle>;
}

/**
 * What the greeting calls you.
 *
 * A first name is the greeting; a full name in a heading reads as a form
 * letter. `username` is the fallback for accounts created without one, and
 * `null` means the greeting simply stops after "Welcome back". Typed on the
 * two fields it reads rather than on Clerk's `User`, so the page hands in
 * whatever it fetched and this file stays free of the auth client.
 */
export function greetingName(
  user: { firstName: string | null; username: string | null } | null,
): string | null {
  return user?.firstName ?? user?.username ?? null;
}
