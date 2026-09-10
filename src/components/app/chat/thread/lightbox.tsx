"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Photo } from "@/components/app/chat/photo";
import { previewFor } from "@/lib/images";
import type { ChatImage } from "../../../../../convex/chat/messages";

/**
 * Where a picture is drawn from: the preview this browser uploaded when it
 * has one, and the stored file otherwise. Same pixels either way.
 *
 * Here rather than beside `Pictures` because both the grid and the lightbox
 * read it, and the grid opens the lightbox — so this is the module the
 * other one can import from without the two importing each other.
 */
export function sourceOf(image: ChatImage): string {
  return previewFor(image.attachmentId) ?? image.url;
}

/**
 * A picture, full size, over everything.
 *
 * Into `document.body`, because the thread scrolls and a fixed element
 * inside an ancestor with a transform is fixed to the ancestor. A press
 * anywhere or an Escape closes it — there is nothing to do here but look.
 */
export function Lightbox({
  image,
  onClose,
}: {
  image: ChatImage;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label="Picture"
      onClick={onClose}
      className="animate-notice-in fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    >
      <Photo
        src={sourceOf(image)}
        width={image.width}
        height={image.height}
        className="block h-auto max-h-full w-auto max-w-full rounded-xl object-contain shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)]"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <XMarkIcon strokeWidth={2} className="size-5" />
      </button>
    </div>,
    document.body,
  );
}
