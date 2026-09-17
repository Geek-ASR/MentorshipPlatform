import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const isProductionSite = process.env.APP_ENV === "production";

/**
 * Baseline CSP for all routes (docs/11 §9.1, ADR-021). Scripts still allow 'unsafe-inline' because
 * statically rendered SEO pages cannot carry per-request nonces; a strict nonce-based policy is added
 * for authenticated, dynamic areas via proxy.ts in Phase 5. Third-party origins (Razorpay, Turnstile)
 * are added only when those integrations land.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(appBaseUrl.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(isProductionSite ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: { remotePatterns: [] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
