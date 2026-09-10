/**
 * The dot lattice that fades out under the head of a page.
 *
 * Absolutely positioned across the top of a `relative` section and pushed
 * behind it, so the copy sits on it rather than in it. `height` is a CSS
 * length rather than a class because it is the one thing that varies — the
 * hero's runs on down behind the product, a page intro's stops sooner — and
 * an interpolated `h-[…]` is a class Tailwind never sees.
 */
export function DotBand({ height }: { height: string }) {
  return (
    <div
      aria-hidden
      className="bg-dots pointer-events-none absolute inset-x-0 top-0 -z-10 [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.6),transparent)]"
      style={{ height }}
    />
  );
}
