import { ImageResponse } from "next/og";
import { getDb } from "@/server/platform/db/client";
import { getMentorProfileDetailBySlug } from "@/server/modules/profiles";
import { brand } from "@/config/brand";

export const alt = "Mentor profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type ImageParams = { slug: string };

/** docs/22 §10.2: "generated OG images (mentor name + headline; university name)". Statically
 * optimized at build time per route (next/og docs) since it reads no request-time data. */
export default async function Image({ params }: { params: Promise<ImageParams> }) {
  const { slug } = await params;
  const db = await getDb();
  const detail = await getMentorProfileDetailBySlug(db, slug);
  const name = detail?.displayName ?? brand.name;
  const headline = detail?.profile.headline ?? brand.tagline;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: "#FAFAF7",
        color: "#0B1B2B",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 28, color: "#0E5A6B", fontWeight: 600 }}>
        {brand.name}
      </div>
      <div
        style={{ display: "flex", marginTop: 40, fontSize: 64, fontWeight: 600, lineHeight: 1.15 }}
      >
        {name}
      </div>
      <div style={{ display: "flex", marginTop: 24, fontSize: 32, color: "#5B6470" }}>
        {headline}
      </div>
    </div>,
    { ...size },
  );
}
