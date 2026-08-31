import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { LEGAL_UPDATED } from "@/lib/legal";

/**
 * Everything on this site a crawler should know about. `robots.ts` disallows
 * the three prefixes that are missing here — `/dashboard`, `/auth`, and
 * `/learn` — and between them that is the whole route tree.
 *
 * The legal pages carry the date the documents were last revised rather than
 * `new Date()`. A `lastModified` that moves on every build tells a crawler
 * the terms changed when they did not, which is the one signal on these two
 * pages that is worth being accurate about.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const legalModified = new Date(`${LEGAL_UPDATED}T00:00:00Z`);

  return [
    {
      url: brand.url,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${brand.url}/tos`,
      lastModified: legalModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${brand.url}/pp`,
      lastModified: legalModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
