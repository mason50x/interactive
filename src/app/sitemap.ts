import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: brand.url,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
