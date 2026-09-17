import type { MetadataRoute } from "next";

/** Non-production environments are never indexed (docs/22 §10.4). */
export default function robots(): MetadataRoute.Robots {
  if (process.env.APP_ENV !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  const base = process.env.APP_BASE_URL ?? "";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/api", "/dev"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
