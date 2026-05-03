import type { MetadataRoute } from "next";

const BASE = "https://praxtalk.com";

const PAGES: { path: string; priority: number; changefreq: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, changefreq: "weekly" },
  // Top-level marketing routes (extracted from homepage anchors).
  { path: "/product", priority: 0.9, changefreq: "weekly" },
  { path: "/ai", priority: 0.9, changefreq: "weekly" },
  { path: "/integrations", priority: 0.9, changefreq: "weekly" },
  { path: "/compare", priority: 0.9, changefreq: "weekly" },
  { path: "/pricing", priority: 0.9, changefreq: "weekly" },
  { path: "/security", priority: 0.8, changefreq: "monthly" },
  { path: "/about", priority: 0.7, changefreq: "monthly" },
  { path: "/customers", priority: 0.7, changefreq: "monthly" },
  { path: "/changelog", priority: 0.7, changefreq: "weekly" },
  { path: "/docs", priority: 0.7, changefreq: "weekly" },
  { path: "/docs/api", priority: 0.7, changefreq: "weekly" },
  { path: "/careers", priority: 0.6, changefreq: "monthly" },
  { path: "/press", priority: 0.5, changefreq: "monthly" },
  { path: "/status", priority: 0.5, changefreq: "weekly" },
  { path: "/privacy", priority: 0.6, changefreq: "monthly" },
  { path: "/terms", priority: 0.6, changefreq: "monthly" },
  { path: "/contact", priority: 0.6, changefreq: "monthly" },
  { path: "/book-demo", priority: 0.8, changefreq: "monthly" },
  { path: "/sign-up", priority: 0.9, changefreq: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PAGES.map((p) => ({
    url: `${BASE}${p.path}`,
    lastModified: now,
    changeFrequency: p.changefreq,
    priority: p.priority,
  }));
}
