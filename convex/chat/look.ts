import { MAX_INITIALS } from "../moderation/limits";

/** A face, as a group or a profile wears one. Every field may be unset. */
export type Look = {
  hue?: number;
  emoji?: string;
  initials?: string;
};

/**
 * The face a caller asked for, reduced to what the disc may show.
 *
 * The same rule for a group and for a profile, in the same order. A hue has
 * to be one on the wheel and an emoji one of the fixed faces; anything else
 * is dropped rather than refused, because a stale picker is not worth an
 * error. Initials are kept only when there is no emoji: the disc has room for
 * one thing, and an emoji is the more deliberate of the two to have chosen.
 */
export function pickLook(
  wheel: readonly number[],
  faces: readonly string[],
  { hue, emoji, initials }: Look,
): Look {
  const nextHue = hue !== undefined && wheel.includes(hue) ? hue : undefined;
  const nextEmoji =
    emoji !== undefined && faces.includes(emoji) ? emoji : undefined;

  const wanted = (initials ?? "").trim();
  const nextInitials =
    nextEmoji === undefined &&
    wanted.length >= 1 &&
    wanted.length <= MAX_INITIALS &&
    /^[a-z0-9]+$/i.test(wanted)
      ? wanted
      : undefined;

  return { hue: nextHue, emoji: nextEmoji, initials: nextInitials };
}
