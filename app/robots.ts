import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Operator dashboard, transactional, auth, and ops pages.
        // Status + customers are noindex via metadata too — disallow
        // here keeps crawl budget off them entirely.
        disallow: [
          "/app/",
          "/app",
          "/setup",
          "/login",
          "/forgot-password",
          "/reset-password/",
          "/invite/",
          "/book/",
          "/status",
          "/admin/",
          "/admin",
        ],
      },
    ],
    sitemap: "https://www.praxtalk.com/sitemap.xml",
  };
}
