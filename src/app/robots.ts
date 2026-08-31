import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in surfaces and Clerk's auth routes have nothing to index and
      // would only ever resolve to a redirect for a crawler. `/learn` is where
      // an activity is framed: it is behind the session and only ever reached
      // by being embedded from a dashboard page.
      disallow: ["/dashboard", "/auth", "/learn"],
    },
    sitemap: `${brand.url}/sitemap.xml`,
    host: brand.url,
  };
}
