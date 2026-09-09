"use client";

/**
 * A third-party bundle, framed inside `/learn`.
 *
 * This is the inner half of a nested frame, and the nesting is deliberate:
 *
 *     app origin     ActivityFrame        session-gated route, CSP frame-ancestors
 *       └─ app origin  /learn (this)      static shell, no session client near it
 *            └─ asset origin  the bundle  static files, cross-origin to everything
 *
 * The obvious alternative — point `ActivityFrame` straight at the bucket and
 * drop this level — loses two things. The bundle URL would no longer be gated,
 * because the bucket sits outside the app and nothing checks a session on the
 * way to it; and `frame-ancestors` would be unenforceable, because that header
 * has to come from the framed origin and a bucket does not send one. Keeping
 * `/learn` in the middle means a bundle URL is only ever handed to a page that
 * already required a session.
 *
 * This page runs on the app's own origin now that the player host is gone (see
 * `src/lib/learn.ts`), but the bundle below it does not — it is a cross-origin
 * document on the asset origin, which is the boundary that actually contains
 * activity code. Proxying the bundle bytes through this deployment instead
 * would put all 5.4 GB back on Vercel's Fast Data Transfer bill, which is the
 * entire reason the bucket exists.
 *
 * No `postMessage` handling here. The app's score protocol is something our
 * own activities opt into; upstream bundles know nothing about it, so there is
 * nothing to relay and `ActivityFrame` simply never hears from them.
 */
export function HostedActivity({ title, src }: { title: string; src: string }) {
  return (
    <iframe
      src={src}
      title={title}
      // Eaglercraft cancels canvas mouse-down defaults, so clicking it does
      // not reliably focus its window after focus returns to the app shell.
      // Focus the actual game window when the pointer comes back. Cross-origin
      // Window.focus() is allowed; this does not access the game's document.
      onMouseEnter={(event) => event.currentTarget.contentWindow?.focus()}
      /**
       * A nested frame can only ever be more restricted than the one holding
       * it, never less — so every capability here must also be granted by
       * `ActivityFrame`'s sandbox, or it is silently dropped at this level.
       *
       * `allow-same-origin` is safe because the bucket is a different origin
       * to this document — cross-origin whether or not the app has a player
       * host — so it buys the bundle its own storage for save states and
       * reaches nothing of ours. `allow-pointer-lock` is what the driving and
       * 3D titles need to capture the mouse.
       */
      sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      allow="gamepad; fullscreen; autoplay"
      referrerPolicy="no-referrer"
      /* The learn layout is a centring `min-h-svh` column; `flex-1` with
         `self-stretch` is what turns this from a centred box into the whole
         board, without the layout needing to know which runtime it holds. */
      className="w-full flex-1 self-stretch border-0"
    />
  );
}
