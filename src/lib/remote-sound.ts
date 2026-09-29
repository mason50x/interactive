/**
 * Shared by the Convex module (`convex/remoteSound.ts`) and the client
 * listener (`src/components/app/remote-sound.tsx`), which cannot import from
 * `convex/` without dragging the server runtime into the browser bundle.
 */

/**
 * How old a ping can be and still be played by a tab that has only just
 * subscribed. A tab opened a minute after the button was pressed should not
 * beep on arrival; one that was mid-load when it was pressed should.
 */
export const REMOTE_SOUND_FRESH_MS = 15_000;
