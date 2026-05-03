import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Operator dashboard + setup are auth-walled — no value in
        // crawling, and we don't want them in search results.
        disallow: ["/app/", "/setup", "/login", "/forgot-password", "/reset-password/"],
      },
    ],
    sitemap: "https://www.praxtalk.com/sitemap.xml",
  };
}
