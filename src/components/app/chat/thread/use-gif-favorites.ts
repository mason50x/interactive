"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GifResult } from "@/lib/klipy";
import { api } from "@convex/_generated/api";

/** How long the "saved GIFs are full" line stays on screen. */
const NOTICE_MS = 3200;

/**
 * The account's hearted GIFs, live, and the one verb that changes them.
 *
 * `api.chat.gifFavorites.mine` is a subscription, so a heart tapped on a
 * phone is in this tab's saved row a moment later. The toggle is a mutation
 * with an optimistic update rather than local state, for the same reason the
 * preferences are: the heart fills on the frame it is tapped, and the server's
 * answer replaces the guess when it lands, or undoes it if the write failed.
 *
 * `saved` is `undefined` until the first answer arrives, which the picker
 * reads as "do not draw the saved row yet" rather than "there is nothing".
 */
export function useGifFavorites() {
  const saved = useQuery(api.chat.gifFavorites.mine);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null)
        window.clearTimeout(noticeTimer.current);
    };
  }, []);

  const show = useCallback((text: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => {
      noticeTimer.current = null;
      setNotice(null);
    }, NOTICE_MS);
  }, []);

  const save = useMutation(api.chat.gifFavorites.save).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.chat.gifFavorites.mine, {});
      if (current === undefined) return;
      if (current.some((item) => item.slug === args.gif.slug)) return;
      store.setQuery(api.chat.gifFavorites.mine, {}, [
        {
          slug: args.gif.slug,
          title: args.gif.title ?? "",
          preview: args.preview,
          gif: args.gif,
        },
        ...current,
      ]);
    },
  );

  const remove = useMutation(api.chat.gifFavorites.remove).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.chat.gifFavorites.mine, {});
      if (current === undefined) return;
      store.setQuery(
        api.chat.gifFavorites.mine,
        {},
        current.filter((item) => item.slug !== args.slug),
      );
    },
  );

  const slugs = useMemo(
    () => new Set(saved?.map((item) => item.slug) ?? []),
    [saved],
  );

  const toggle = useCallback(
    (result: GifResult) => {
      if (slugs.has(result.slug)) {
        void remove({ slug: result.slug }).catch(console.error);
        return;
      }
      void save({ gif: result.gif, preview: result.preview }).then(
        (outcome) => {
          if (outcome.ok) return;
          show(
            outcome.refusal === "full"
              ? "Saved GIFs are full. Remove one to save another."
              : "That GIF couldn’t be saved.",
          );
        },
        console.error,
      );
    },
    [slugs, save, remove, show],
  );

  return { saved, isSaved: (slug: string) => slugs.has(slug), toggle, notice };
}
