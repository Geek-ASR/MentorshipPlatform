import type { MetadataRoute } from "next";
import { KINDS } from "./sitemap";

const isProductionSite = process.env.APP_ENV === "production";
const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

/** docs/22 §10.4. Non-production environments disallow everything — the root layout's own
 * `robots` meta already does the same per-page (docs/19 Phase 5), but a crawler that ignores meta
 * tags still respects this file, so both layers apply independently.
 *
 * `sitemap.ts` uses `generateSitemaps` to split by content type, which Next serves at
 * `/sitemap/{id}.xml` — there is no auto-generated combining `/sitemap.xml` index for a multi-id
 * `generateSitemaps` (confirmed against the installed Next docs and a local smoke test), so every
 * per-type sitemap is listed directly here instead; `sitemap`'s own `Sitemap` type allows a list. */
export default function robots(): MetadataRoute.Robots {
  if (!isProductionSite) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/admin", "/api", "/dev"],
    },
    sitemap: KINDS.map((_, index) => `${appBaseUrl}/sitemap/${index}.xml`),
  };
}
