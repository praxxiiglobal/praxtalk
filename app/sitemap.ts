import type { MetadataRoute } from "next";
import { VENDORS } from "./compare/_vendors";

const BASE = "https://www.praxtalk.com";

const PAGES: { path: string; priority: number; changefreq: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, changefreq: "weekly" },
  // Top-level marketing routes (extracted from homepage anchors).
  { path: "/product", priority: 0.9, changefreq: "weekly" },
  { path: "/ai", priority: 0.9, changefreq: "weekly" },
  { path: "/integrations", priority: 0.9, changefreq: "weekly" },
  { path: "/compare", priority: 0.9, changefreq: "weekly" },
  // Per-vendor long-tail SEO pages — generated from VENDORS list.
  ...VENDORS.map((v) => ({
    path: `/compare/${v.slug}`,
    priority: 0.8,
    changefreq: "monthly" as const,
  })),
  { path: "/pricing", priority: 0.9, changefreq: "weekly" },
  { path: "/security", priority: 0.8, changefreq: "monthly" },
  { path: "/accessibility", priority: 0.6, changefreq: "monthly" },
  { path: "/about", priority: 0.7, changefreq: "monthly" },
  // /customers excluded — noindex until real case studies exist.
  { path: "/changelog", priority: 0.7, changefreq: "weekly" },
  { path: "/docs", priority: 0.7, changefreq: "weekly" },
  { path: "/docs/api", priority: 0.7, changefreq: "weekly" },
  { path: "/careers", priority: 0.6, changefreq: "monthly" },
  { path: "/press", priority: 0.5, changefreq: "monthly" },
  // /status excluded — operational page, noindex.
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
