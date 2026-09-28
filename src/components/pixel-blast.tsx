"use client";

import dynamic from "next/dynamic";

/**
 * The WebGL backdrop, loaded in the browser and nowhere else.
 *
 * `PixelBlast` draws with three.js and postprocessing, which together are
 * the largest module in the app. It renders nothing without a canvas, so
 * there is no server-side output to lose by skipping it there, and a lot to
 * gain: with a static import, every Server Component tree that reached a
 * page using it — Home, and Settings through the Home tab's section list —
 * made the Worker evaluate that whole bundle on an isolate's first request.
 * `ssr: false` keeps it out of the server graph entirely, and the browser
 * fetches it as its own chunk only once a page that shows it is on screen.
 */
export const PixelBlast = dynamic(() => import("@/components/PixelBlast"), {
  ssr: false,
});
