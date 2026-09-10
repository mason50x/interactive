/**
 * The release notes, hardcoded.
 *
 * One post per release, newest first. This is what the rail's version chip
 * and the "What's new" sheet read: the chip shows the version and the
 * title, and the sheet shows the post. Releases ship with the code, so
 * their notes live in the code: shipping one is a new entry at the top of
 * this list in the same change, and the chip turns over on deploy with
 * nothing to publish and no table to keep tidy.
 *
 * Written for the person using the app, not the person who built it: what
 * is different for them, and nothing about how. `body` is paragraphs
 * separated by blank lines; a paragraph whose lines all start with `- ` is
 * a list.
 */
export type Release = {
  version: string;
  /** ISO date. */
  date: string;
  title: string;
  body: string;
};

export const releases: readonly Release[] = [
  {
    version: "1.0",
    date: "2026-09-08",
    title: "Locked in?",
    body: `You've probably been using this for a few days now. We're working on making it an end-to-end product, and this is the first proper release.

What's in it:

- The bot says hi when you start a chat with it, and the plus button in the composer shows how many bot tags you have left today.
- Messaging is simpler. Direct messages are friends only, for everyone, and anyone can be found by their handle.
- The sidebar tells you when someone mentions you in a group, and unread rooms glint now and then so you notice without watching.
- The icons in the sidebar have small animations of their own.
- The security check has a new look: the letter fills with water while the constellation drifts behind it, then bursts apart as it lets you in.
- Pictures upload more reliably, and quoting a long message no longer stretches the chat.
- Release notes, right here. The version in the sidebar lights up when there is something new.`,
  },
];

export const currentRelease = releases[0];

/** How a version is written wherever it is shown: `v1.1`. */
export function versionLabel(version: string) {
  return `v${version}`;
}
