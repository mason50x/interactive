import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameFrame } from "@/components/app/game-frame";
import { findGame } from "@/lib/games";
import { playerOrigin, playerUrl } from "@/lib/player";
import { mintPlayerGrant } from "@/lib/player-token";

const SLUG = "animal-adventure";

export const metadata: Metadata = { title: "Animal Adventure" };

export default async function AnimalAdventurePage() {
  // The layout guards the shell, but the router does not re-render a shared
  // layout between sibling pages, so every page under /dashboard guards itself.
  const { userId } = await auth.protect();

  const game = findGame(SLUG);
  if (!game) notFound();

  // Minted here, after the guard, because this is the last point that both
  // knows who the user is and can still reach the signing secret. The player
  // origin gets the result and never the session it was derived from.
  const grant = await mintPlayerGrant(game.slug, userId);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12 sm:px-10 lg:py-16">
      <div>
        <p className="label-small uppercase tracking-[0.14em] text-faint">Play</p>
        <h1 className="text-display mt-3 text-[2rem]">{game.title}</h1>
        <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
          {game.tagline} {game.controls}
        </p>
      </div>

      <GameFrame
        slug={game.slug}
        title={game.title}
        src={playerUrl(game.slug, grant)}
        playerOrigin={playerOrigin()}
      />
    </div>
  );
}
