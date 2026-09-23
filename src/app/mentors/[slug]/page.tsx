import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Globe, Languages } from "lucide-react";
import { brand } from "@/config/brand";
import { getDb } from "@/server/platform/db/client";
import { getMentorProfileDetailBySlug } from "@/server/modules/profiles";
import { listCredentials } from "@/server/modules/verification";
import {
  findSchedulingSettings,
  getAvailableSlots,
  listServicesForMentor,
} from "@/server/modules/booking";
import { Badge } from "@/ui/badge";
import { Card, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";

type PageParams = { slug: string };

async function loadListedProfile(slug: string) {
  const db = await getDb();
  const detail = await getMentorProfileDetailBySlug(db, slug);
  if (!detail || !detail.profile.isListed) return null;
  const credentials = await listCredentials(db, detail.profile.userId);
  return { detail, credentials };
}

type UpcomingSlot = { start: Date; end: Date };

/**
 * Server-rendered only (docs/19 Phase 7 deviation): the interactive "pick a slot and book" flow
 * needs a signed-in visitor, and there is no sign-in page yet (deferred since Phase 5) — building a
 * book button that always fails for an anonymous visitor would be misleading. This still shows real,
 * live availability so the scheduling data is genuinely visible on the site.
 */
async function loadBookingPreview(mentorUserId: string) {
  const db = await getDb();
  const [settings, services] = await Promise.all([
    findSchedulingSettings(db, mentorUserId),
    listServicesForMentor(db, mentorUserId),
  ]);
  const activeFreeServices = services.filter(
    (s) => s.isActive && s.prices.some((p) => p.priceMinor === 0),
  );
  if (!settings || activeFreeServices.length === 0) {
    return { timezone: null, service: null, slots: [] as UpcomingSlot[] };
  }
  const service = activeFreeServices[0]!;
  const freePrice = service.prices.find((p) => p.priceMinor === 0)!;
  const now = new Date();
  const slots = await getAvailableSlots(
    db,
    {
      mentorUserId,
      serviceId: service.id,
      durationMin: freePrice.durationMin,
      from: now,
      to: new Date(now.getTime() + 7 * 86_400_000),
    },
    now,
  );
  return { timezone: settings.timezone, service, slots: slots.slice(0, 6) };
}

function formatSlot(slot: UpcomingSlot, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(slot.start);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadListedProfile(slug);
  if (!loaded) return { title: "Mentor not found", robots: { index: false, follow: false } };
  const { detail } = loaded;
  const title = detail.profile.headline
    ? `${detail.displayName} — ${detail.profile.headline}`
    : detail.displayName;
  const description = detail.profile.bioMd?.slice(0, 155) ?? brand.description;
  return {
    title,
    description,
    alternates: { canonical: `/mentors/${slug}` },
    robots: detail.profile.searchIndexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: { type: "profile", title, description },
  };
}

export default async function MentorProfilePage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const loaded = await loadListedProfile(slug);
  if (!loaded) notFound();
  const { detail, credentials } = loaded;
  const booking = await loadBookingPreview(detail.profile.userId);

  const credentialByAffiliation = new Map(
    credentials
      .filter((c) => c.status === "active" && c.affiliationId)
      .map((c) => [c.affiliationId, c]),
  );

  const appBaseUrl = process.env.APP_BASE_URL ?? "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: appBaseUrl },
          {
            "@type": "ListItem",
            position: 2,
            name: "Explore mentors",
            item: `${appBaseUrl}/mentors`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: detail.displayName,
            item: `${appBaseUrl}/mentors/${slug}`,
          },
        ],
      },
      {
        "@type": "ProfilePage",
        mainEntity: {
          "@type": "Person",
          name: detail.displayName,
          ...(detail.profile.headline ? { jobTitle: detail.profile.headline } : {}),
          alumniOf: detail.affiliations
            .filter((a) => a.kind === "education" && a.organizationName)
            .map((a) => ({ "@type": "CollegeOrUniversity", name: a.organizationName })),
          knowsAbout: detail.expertise.map((e) => e.name),
        },
      },
    ],
  };

  return (
    <Container className="py-12 md:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {detail.displayName}
          </h1>
          {detail.profile.headline ? (
            <p className="mt-2 text-lg text-ink-muted">{detail.profile.headline}</p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {detail.countryIso2 ? (
              <Badge>
                <Globe className="size-3.5" aria-hidden="true" /> {detail.countryIso2}
              </Badge>
            ) : null}
            {detail.languages.map((language) => (
              <Badge key={language.id}>
                <Languages className="size-3.5" aria-hidden="true" /> {language.name}
              </Badge>
            ))}
          </div>

          {detail.profile.bioMd ? (
            <section aria-labelledby="about-heading" className="mt-10">
              <h2 id="about-heading" className="text-xl font-semibold text-ink">
                About
              </h2>
              <p className="mt-3 max-w-2xl whitespace-pre-line text-ink-muted">
                {detail.profile.bioMd}
              </p>
            </section>
          ) : null}

          <section aria-labelledby="experience-heading" className="mt-10">
            <h2 id="experience-heading" className="text-xl font-semibold text-ink">
              Education & experience
            </h2>
            <ul className="mt-4 space-y-4">
              {detail.affiliations.map((affiliation) => {
                const credential = credentialByAffiliation.get(affiliation.id);
                return (
                  <li key={affiliation.id}>
                    <Card>
                      <CardTitle>{affiliation.title}</CardTitle>
                      <p className="mt-1 text-sm text-ink-muted">
                        {affiliation.organizationName ?? "Unlisted organisation"}
                        {affiliation.isCurrent ? " · Current" : ""}
                      </p>
                      {credential ? (
                        <div className="mt-3">
                          <Badge tone="primary">
                            <BadgeCheck className="size-3.5" aria-hidden="true" />{" "}
                            {credential.publicLabel}
                          </Badge>
                        </div>
                      ) : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>

          {detail.expertise.length > 0 ? (
            <section aria-labelledby="expertise-heading" className="mt-10">
              <h2 id="expertise-heading" className="text-xl font-semibold text-ink">
                Can help with
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Expertise">
                {detail.expertise.map((term) => (
                  <li key={term.id}>
                    <Badge tone="accent">{term.name}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="flex h-fit flex-col gap-6">
          <aside
            aria-label="Reliability"
            className="rounded-[var(--radius-card)] border border-line bg-surface p-6"
          >
            <p className="text-sm text-ink-muted">Reliability</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {detail.stats ? `${detail.stats.reliabilityPct}%` : "New mentor"}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              {detail.stats && detail.stats.reviewCount >= 3
                ? `${detail.stats.reviewCount} reviews`
                : "Not enough reviews yet"}
            </p>
          </aside>

          <aside
            aria-label="Book a session"
            className="rounded-[var(--radius-card)] border border-line bg-surface p-6"
          >
            <p className="text-sm text-ink-muted">Book a session</p>
            {booking.service && booking.timezone ? (
              <>
                <p className="mt-1 text-lg font-semibold text-ink">{booking.service.title}</p>
                <p className="mt-1 text-sm text-ink-muted">Free · 1:1</p>
                {booking.slots.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {booking.slots.map((slot) => (
                      <li
                        key={slot.start.toISOString()}
                        className="rounded-[var(--radius-control)] border border-line px-3 py-2 text-sm text-ink"
                      >
                        {formatSlot(slot, booking.timezone!)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">
                    No upcoming openings in the next 7 days.
                  </p>
                )}
                <p className="mt-4 text-xs text-ink-muted">
                  Booking is available via the API today; an in-page booking flow is coming soon.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">
                This mentor hasn&apos;t opened booking yet.
              </p>
            )}
          </aside>
        </div>
      </div>
    </Container>
  );
}
