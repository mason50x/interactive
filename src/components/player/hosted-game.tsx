/**
 * A third-party bundle, framed on the player origin.
 *
 * This is the inner half of a nested frame, and the nesting is deliberate:
 *
 *     app origin        GameFrame          grant in the URL, CSP frame-ancestors
 *       └─ player origin  this component   grant verified by src/proxy.ts
 *            └─ asset origin  the bundle   static files, no session anywhere near
 *
 * The obvious alternative — point `GameFrame` straight at the bucket and drop
 * a level — loses two things. The grant would no longer gate anything, because
 * the bucket never sees the proxy that verifies it; and `frame-ancestors`
 * would be unenforceable, because that header has to come from the framed
 * origin and a bucket does not send one. Keeping the player origin in the
 * middle means the URL of a bundle is only learnable from a page that already
 * required a valid grant.
 *
 * The other alternative — proxying bundle bytes through this deployment —
 * would put all 5.4 GB back on Vercel's Fast Data Transfer bill, which is the
 * entire reason the bucket exists.
 *
 * No `postMessage` handling here. The app's score protocol is something our
 * own games opt into; upstream bundles know nothing about it, so there is
 * nothing to relay and `GameFrame` simply never hears from them.
 */
export function HostedGame({ title, src }: { title: string; src: string }) {
  return (
    <iframe
      src={src}
      title={title}
      /**
       * A nested frame can only ever be more restricted than the one holding
       * it, never less — so every capability here must also be granted by
       * `GameFrame`'s sandbox, or it is silently dropped at this level.
       *
       * `allow-same-origin` is safe for the same reason it is in `GameFrame`:
       * the bucket is already a different origin to this document, so it buys
       * the bundle its own storage bucket for save states and reaches nothing
       * of ours. `allow-pointer-lock` is what the driving and 3D titles need
       * to capture the mouse.
       */
      sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      allow="gamepad; fullscreen; autoplay"
      referrerPolicy="no-referrer"
      /* The player layout is a centring `min-h-svh` column; `flex-1` with
         `self-stretch` is what turns this from a centred box into the whole
         board, without the layout needing to know which runtime it holds. */
      className="w-full flex-1 self-stretch border-0"
    />
  );
}
