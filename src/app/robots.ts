import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in surfaces and Clerk's auth routes have nothing to index and
      // would only ever resolve to a redirect for a crawler. `/player` is the
      // segment the player host is rewritten into: it is only ever reached by
      // being framed, and on the app host it 404s outright.
      disallow: ["/dashboard", "/auth", "/player"],
    },
    sitemap: `${brand.url}/sitemap.xml`,
    host: brand.url,
  };
}
