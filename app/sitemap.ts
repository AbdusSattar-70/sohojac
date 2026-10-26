import type { MetadataRoute } from "next";

const base = "https://sohojac.com";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/about", "/faq", "/journal", "/interest", "/privacy"].map(path => ({
    url: base + path,
    changeFrequency: path === "/" ? "weekly" : "monthly" as const,
    priority: path === "/" ? 1 : 0.6,
  }));
}
