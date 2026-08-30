import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SnakeGame } from "@/components/player/snake-game";
import { findGame } from "@/lib/games";
import { siteUrl } from "@/lib/site-url";

/**
 * Slug to implementation.
 *
 * The catalogue in `src/lib/games.ts` is the metadata; this is the code. They
 * are separate because the app has to render a title and a description for a
 * game without pulling the game's bundle into the app's own origin.
 */
const RUNTIMES: Record<string, (props: { appOrigin: string }) => React.ReactNode> = {
  "animal-adventure": SnakeGame,
};

export async function generateMetadata({
  params,
}: PageProps<"/player/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: findGame(slug)?.title ?? "Player" };
}

export default async function PlayerPage({ params }: PageProps<"/player/[slug]">) {
  const { slug } = await params;

  const game = findGame(slug);
  const Runtime = RUNTIMES[slug];
  if (!game || !Runtime) notFound();

  // Resolved on the server because the client cannot: on the player origin,
  // `window.location` names the player, and the app's origin is exactly what
  // a `postMessage` needs as its target. Passing "*" instead would broadcast
  // to whatever ended up framing this page.
  return <Runtime appOrigin={siteUrl()} />;
}
