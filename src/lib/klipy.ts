import type { ChatGif } from "@convex/chat/messages";

/**
 * GIF search, through KLIPY.
 *
 * Called from the browser and never from our servers, and every picture is
 * loaded from the link KLIPY returns: their integration requirements forbid
 * proxying requests, and storing or re-hosting the media. The app key is
 * therefore public, the way a Maps key is. Filtering and blocked terms are
 * configured in the KLIPY Partner Panel, not here — results must be shown in
 * the order and composition KLIPY returns them.
 *
 * Hearting a GIF in the picker keeps the same links a message keeps — see
 * `convex/chat/gifFavorites.ts` — and, as with a message, never the media.
 *
 * Unset `NEXT_PUBLIC_KLIPY_APP_KEY` and the GIF picker is simply not offered.
 */
const APP_KEY = process.env.NEXT_PUBLIC_KLIPY_APP_KEY ?? "";
const BASE = "https://api.klipy.com/api/v1";
const PER_PAGE = 24;
const CUSTOMER_KEY = "50x:klipy-customer";

export const gifsAvailable = APP_KEY !== "";

type Rendition = { url: string; width: number; height: number };
type KlipyItem = {
  slug: string;
  title?: string;
  type?: string;
  file?: Partial<
    Record<
      "hd" | "md" | "sm" | "xs",
      Partial<Record<"gif" | "webp", Rendition>>
    >
  >;
};

/** One result: a small rendition for the grid, and the one a message keeps. */
export type GifResult = {
  slug: string;
  title: string;
  preview: Rendition;
  gif: ChatGif;
};

export type GifPage = { results: GifResult[]; hasNext: boolean };

/**
 * A stable, meaningless id for this browser, which KLIPY uses to tailor
 * trending. Not the account id: nothing about the person needs to leave.
 */
function customerId(): string {
  try {
    let id = window.localStorage.getItem(CUSTOMER_KEY);
    if (id === null) {
      id = crypto.randomUUID();
      window.localStorage.setItem(CUSTOMER_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

function pick(item: KlipyItem, size: "md" | "sm"): Rendition | null {
  const files = item.file?.[size];
  return files?.webp ?? files?.gif ?? null;
}

/** Trending when `query` is blank, search otherwise. `page` counts from 1. */
export async function fetchGifs(
  query: string,
  page: number,
  signal: AbortSignal,
): Promise<GifPage> {
  const q = query.trim();
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(PER_PAGE),
    customer_id: customerId(),
    locale: navigator.language.split("-")[1]?.toLowerCase() ?? "us",
    content_filter: "high",
    format_filter: "webp,gif",
  });
  if (q !== "") params.set("q", q);
  const response = await fetch(
    `${BASE}/${encodeURIComponent(APP_KEY)}/gifs/${q === "" ? "trending" : "search"}?${params}`,
    { signal },
  );
  if (!response.ok) throw new Error(`KLIPY ${response.status}`);
  const json = (await response.json()) as {
    result?: boolean;
    data?: { data?: KlipyItem[]; has_next?: boolean };
  };
  if (json.result === false) throw new Error("KLIPY refused the request");
  const results: GifResult[] = [];
  for (const item of json.data?.data ?? []) {
    // Ads arrive as their own `type` when monetisation is switched on,
    // which it is not; anything that is not a GIF has nothing to draw.
    if (item.type !== undefined && item.type !== "gif") continue;
    const full = pick(item, "md");
    const preview = pick(item, "sm") ?? full;
    if (full === null || preview === null) continue;
    results.push({
      slug: item.slug,
      title: item.title ?? "",
      // Copied field by field: KLIPY's rendition carries extras (`size`)
      // that the favorites validator rejects.
      preview: {
        url: preview.url,
        width: Math.round(preview.width),
        height: Math.round(preview.height),
      },
      gif: {
        slug: item.slug,
        url: full.url,
        width: Math.round(full.width),
        height: Math.round(full.height),
        title: item.title?.slice(0, 120) || undefined,
      },
    });
  }
  return { results, hasNext: json.data?.has_next === true };
}
