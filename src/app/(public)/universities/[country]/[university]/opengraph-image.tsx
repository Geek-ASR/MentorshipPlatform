import { ImageResponse } from "next/og";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/platform/db/client";
import { countries } from "@/server/platform/db/tables/reference";
import { universities } from "@/server/platform/db/tables/geo";
import { brand } from "@/config/brand";

export const alt = "University";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type ImageParams = { country: string; university: string };

export default async function Image({ params }: { params: Promise<ImageParams> }) {
  const { country: countrySlug, university: universitySlug } = await params;
  const db = await getDb();
  const [country] = await db
    .select()
    .from(countries)
    .where(eq(countries.slug, countrySlug))
    .limit(1);
  const [university] = country
    ? await db
        .select({ name: universities.name })
        .from(universities)
        .where(
          and(eq(universities.countryIso2, country.iso2), eq(universities.slug, universitySlug)),
        )
        .limit(1)
    : [];
  const name = university?.name ?? "University";

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
        {brand.name} · Study abroad
      </div>
      <div
        style={{ display: "flex", marginTop: 40, fontSize: 60, fontWeight: 600, lineHeight: 1.15 }}
      >
        {name}
      </div>
      {country ? (
        <div style={{ display: "flex", marginTop: 24, fontSize: 32, color: "#5B6470" }}>
          {country.name}
        </div>
      ) : null}
    </div>,
    { ...size },
  );
}
