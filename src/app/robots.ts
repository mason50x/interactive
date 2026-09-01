import type { MetadataRoute } from "next";

/**
 * Nothing here is for crawling. Not the marketing page, not the legal pages,
 * not the assets.
 *
 * The wildcard rule already covers every crawler that reads this file, so the
 * named blocks below are redundant by construction. They are written out
 * anyway, because "we did not opt in" and "we opted out of you specifically"
 * are different claims to be able to make later, and the second one is the
 * one worth having on record against the AI and dataset crawlers. Some of
 * these tokens — `Google-Extended`, `Applebot-Extended` — are opt-out signals
 * with no crawler behind them at all: they exist only to be named here, and a
 * wildcard disallow is not what their operators say they honour.
 *
 * No `Sitemap:` line and no `Host:`. A sitemap exists to hand a crawler the
 * route tree, which is the opposite of the point, and `src/app/sitemap.ts` is
 * gone for the same reason.
 *
 * This file is a request, and only well-behaved crawlers honour requests. The
 * enforcement that does not depend on goodwill is the `X-Robots-Tag` header in
 * `next.config.ts`, which rides on every response including the ones — images,
 * the manifest, JSON — that have no `<head>` to put a meta tag in.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", disallow: "/" },
      {
        // Search and answer engines.
        userAgent: [
          "Googlebot",
          "Googlebot-Image",
          "Googlebot-News",
          "Google-Extended",
          "GoogleOther",
          "Bingbot",
          "Applebot",
          "Applebot-Extended",
          "DuckDuckBot",
          "Slurp",
          "Yandex",
          "Baiduspider",
          "Teoma",
          "PetalBot",
          "SeznamBot",
        ],
        disallow: "/",
      },
      {
        // Model training, retrieval, and dataset crawlers.
        userAgent: [
          "GPTBot",
          "ChatGPT-User",
          "OAI-SearchBot",
          "ClaudeBot",
          "Claude-User",
          "Claude-SearchBot",
          "anthropic-ai",
          "PerplexityBot",
          "Perplexity-User",
          "CCBot",
          "Amazonbot",
          "Bytespider",
          "Diffbot",
          "FacebookBot",
          "Meta-ExternalAgent",
          "Meta-ExternalFetcher",
          "cohere-ai",
          "cohere-training-data-crawler",
          "AI2Bot",
          "Timpibot",
          "Omgilibot",
          "ImagesiftBot",
          "Kangaroo Bot",
          "Webzio-Extended",
          "img2dataset",
        ],
        disallow: "/",
      },
      {
        // SEO, backlink, and site-profiling crawlers. These are the ones that
        // build the third-party databases a site ends up described in without
        // ever being asked.
        userAgent: [
          "AhrefsBot",
          "SemrushBot",
          "MJ12bot",
          "DotBot",
          "rogerbot",
          "BLEXBot",
          "DataForSeoBot",
          "Barkrowler",
          "SerpstatBot",
          "ZoominfoBot",
          "magpie-crawler",
          "Sogou web spider",
        ],
        disallow: "/",
      },
    ],
  };
}
