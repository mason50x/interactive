import Image from "next/image";

/**
 * The account's face, at whatever size the row wants it.
 *
 * Not `Monogram`, though it looks like one at a glance. That is chat's face:
 * a disc tinted from a handle, drawn at one size, showing a picture chat
 * itself moderated and stored. This is Clerk's — the picture on the account,
 * served from Clerk's CDN — on a neutral disc when there is none, at 36px in
 * the trigger and 16px in the row behind it. Folding the two together would
 * mean either giving the account a hue it never chose or giving chat a
 * picture it never checked, so they stay two components with one shape.
 */
export function Avatar({
  src,
  name,
  size,
}: {
  src?: string;
  name: string;
  size: number;
}) {
  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-full bg-muted text-[0.75rem] font-medium text-muted-foreground"
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      // Clerk serves these from its own CDN already sized by the `width`
      // query it puts on the URL; running them back through the optimizer
      // would be a second hop for no gain.
      unoptimized
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover"
    />
  );
}
