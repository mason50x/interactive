/**
 * What an activity's frame is allowed, written once for both sides of it.
 *
 * An activity is framed twice — `ActivityFrame` on the app side holds
 * `/learn`, and `HostedActivity` inside `/learn` holds the bundle — and a
 * nested frame can only ever narrow the flags it inherits, never widen them.
 * So the two `sandbox` and `allow` lists have to agree to the token: a
 * capability granted below and not above is silently stripped before the
 * bundle sees it. Holding them here is what keeps a change to one from
 * quietly failing in the other.
 *
 * `allow-same-origin` is safe because the bundle is a different origin to
 * both frames: it buys the bundle its own storage for save states and
 * reaches nothing of ours. `allow-pointer-lock` is what the driving and 3D
 * titles need to capture the mouse. `gamepad` for the same titles;
 * `fullscreen` and `autoplay` because a video going full screen inside the
 * activity is the activity's business rather than ours.
 */
export const ACTIVITY_SANDBOX =
  "allow-scripts allow-same-origin allow-pointer-lock";

export const ACTIVITY_ALLOW = "gamepad; fullscreen; autoplay";

/**
 * Nothing about the app leaks in the request for the bundle, or for `/learn`.
 * The same policy on both frames, for the same reason as the lists above.
 */
export const ACTIVITY_REFERRER_POLICY = "no-referrer";
