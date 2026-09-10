import { useSyncExternalStore, type RefObject } from "react";

/**
 * Element fullscreen, for a stage with its own controls on it.
 *
 * `ActivityFrame` and `ExperienceChrome` both fullscreen a wrapper rather
 * than the iframe inside it, so the controls come along — fullscreening the
 * frame alone would hand the whole screen to the framed document with no way
 * back but Escape — and both need the same three things about it.
 *
 * Both `full` and `canFull` are the browser's state, not ours, so they are
 * read from it rather than mirrored into a `useState` that can fall out of
 * step. Coming *out* of fullscreen is the case that makes this matter: Escape
 * and the browser's own controls do it without going through our button.
 *
 * `full` is compared against the stage rather than tested for null, because
 * a video going fullscreen inside the framed document reports the *iframe*
 * as the fullscreen element, and that is the framed document's business
 * rather than ours.
 *
 * `canFull` is asked rather than assumed: iOS Safari has no element
 * fullscreen at all, and a button that does nothing is worse than no button.
 */
export function useStageFullscreen(stage: RefObject<HTMLElement | null>): {
  full: boolean;
  canFull: boolean;
  toggleFull: () => void;
} {
  const full = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement === stage.current,
    () => false,
  );

  const canFull = useSyncExternalStore(
    subscribeNever,
    () => document.fullscreenEnabled,
    () => false,
  );

  // No `useCallback`: the compiler memoizes this itself, and a hand-written
  // dependency list over a ref's `.current` is one it refuses to preserve.
  const toggleFull = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      // Rejects when the gesture that triggered it has expired. Nothing to
      // recover — the page is unchanged and the button is still there.
      stage.current?.requestFullscreen().catch(() => {});
    }
  };

  return { full, canFull, toggleFull };
}

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

/** For a value the browser fixes at load and never changes again. */
const subscribeNever = () => () => {};
