import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Briefcase,
  CalendarCheck2,
  ChevronRight,
  Clock,
  GraduationCap,
  Languages,
  Info,
  ShieldCheck,
  Star,
} from "lucide-react";
import Link from "next/link";
import { brand } from "@/config/brand";
import { getDb } from "@/server/platform/db/client";
import { getMentorProfileDetailBySlug } from "@/server/modules/profiles";
import { loadMentorProfile } from "@/server/views/mentor-profile";
import { Avatar } from "@/ui/avatar";
import { Container } from "@/ui/container";
import { EventCard } from "@/ui/event-card";
import {
  formatDuration,
  formatLongDate,
  formatMoney,
  formatMonthYear,
  formatTime,
  pluralize,
  zoneLabel,
} from "@/ui/format";
import { RatingSummary } from "@/ui/mentor-card";
import { BookingArea } from "./booking-area";
import { SaveMentorButton } from "./save-button";

type PageParams = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getMentorProfileDetailBySlug(await getDb(), slug);
  if (!detail || !detail.profile.isListed) {
    return { title: "Mentor not found", robots: { index: false, follow: false } };
  }
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

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex" aria-label={`${rating} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={i <= rating ? "size-4 fill-accent text-accent" : "size-4 text-line"}
        />
      ))}
    </span>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="scroll-mt-24 border-t border-line pt-8 first:border-t-0 first:pt-0"
    >
      <h2 id={id} className="text-xl font-semibold text-ink">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function MentorProfilePage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const now = new Date();
  const view = await loadMentorProfile(await getDb(), slug, now);
  if (!view) notFound();
  const { detail } = view;
  const firstName = detail.displayName.split(" ")[0]!;
  const credentialByAffiliation = new Map(view.credentials.map((c) => [c.affiliationId, c]));
  const cheapest = view.services
    .flatMap((s) => s.prices)
    .sort((a, b) => a.priceMinor - b.priceMinor)[0];
  const priceLabel = !cheapest
    ? "Not taking bookings"
    : cheapest.priceMinor === 0
      ? `Free · ${formatDuration(cheapest.durationMin)}`
      : `From ${formatMoney(cheapest.priceMinor, cheapest.currency)}`;
  const sessionsHeld = detail.stats?.sessionsCompleted ?? 0;

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
    <div className="pb-24 lg:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="border-b border-line bg-surface">
        <Container className="py-8 md:py-10">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
            <ol className="flex items-center gap-1.5">
              <li>
                <Link href="/mentors" className="hover:text-ink">
                  Explore mentors
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="size-3.5" />
              </li>
              <li aria-current="page" className="truncate text-ink">
                {detail.displayName}
              </li>
            </ol>
          </nav>

          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
            <Avatar
              name={detail.displayName}
              seed={detail.profile.userId}
              size="2xl"
              className="size-20 text-2xl sm:size-28 sm:text-4xl"
            />
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {detail.displayName}
              </h1>
              {detail.profile.headline ? (
                <p className="mt-1.5 text-lg text-ink-muted">{detail.profile.headline}</p>
              ) : null}

              {view.credentials.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Verified affiliations">
                  {view.credentials.map((credential) => {
                    const affiliation = detail.affiliations.find(
                      (a) => a.id === credential.affiliationId,
                    );
                    return (
                      <li
                        key={credential.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary"
                      >
                        <BadgeCheck className="size-3.5" aria-hidden="true" />
                        {affiliation?.kind === "work" ? "Work" : "University"} email confirmed ·{" "}
                        {affiliation?.organizationName ?? "affiliation"} ·{" "}
                        {formatMonthYear(credential.verifiedAt)}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              <ul className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
                <li className="flex items-center gap-1.5">
                  <RatingSummary rating={view.rating} />
                </li>
                {sessionsHeld > 0 ? (
                  <li className="flex items-center gap-1.5">
                    <CalendarCheck2 className="size-4" aria-hidden="true" />
                    {pluralize(sessionsHeld, "session")} held
                  </li>
                ) : null}
                {detail.stats && sessionsHeld >= 3 ? (
                  <li className="flex items-center gap-1.5">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    {detail.stats.reliabilityPct}% of sessions held as booked
                  </li>
                ) : null}
                {detail.languages.length > 0 ? (
                  <li className="flex items-center gap-1.5">
                    <Languages className="size-4" aria-hidden="true" />
                    <span>
                      <span className="sr-only">Speaks </span>
                      {detail.languages.map((l) => l.name).join(", ")}
                    </span>
                  </li>
                ) : null}
                <li className="tabular flex items-center gap-1.5">
                  <Clock className="size-4" aria-hidden="true" />
                  {formatTime(now, view.timezone)} {zoneLabel(now, view.timezone)} for {firstName}
                </li>
              </ul>
            </div>
            <div className="shrink-0">
              <SaveMentorButton
                mentorUserId={detail.profile.userId}
                slug={slug}
                firstName={firstName}
              />
            </div>
          </div>
        </Container>
      </section>

      <Container className="grid grid-cols-1 gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-8">
          {detail.profile.bioMd ? (
            <Section id="about" title="About">
              <p className="max-w-[70ch] leading-relaxed whitespace-pre-line text-ink/90">
                {detail.profile.bioMd}
              </p>
            </Section>
          ) : null}

          {detail.affiliations.length > 0 ? (
            <Section id="experience" title="Education & experience">
              <ul className="space-y-4">
                {detail.affiliations.map((affiliation) => {
                  const credential = credentialByAffiliation.get(affiliation.id);
                  const Icon = affiliation.kind === "work" ? Briefcase : GraduationCap;
                  return (
                    <li key={affiliation.id} className="flex gap-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-muted ring-1 ring-line">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{affiliation.title}</p>
                        <p className="text-sm text-ink-muted">
                          {affiliation.organizationName ?? "Unlisted organisation"}
                          {affiliation.isCurrent ? " · Current" : ""}
                        </p>
                        {credential ? (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <BadgeCheck className="size-3.5" aria-hidden="true" />
                            {affiliation.kind === "work" ? "Work" : "University"} email confirmed{" "}
                            {formatMonthYear(credential.verifiedAt)}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {detail.expertise.length > 0 ? (
            <Section id="expertise" title="Can help with">
              <ul className="flex flex-wrap gap-2" aria-label="Expertise">
                {detail.expertise.map((term) => (
                  <li
                    key={term.id}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink"
                  >
                    {term.name}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {view.services.length > 0 ? (
            <Section id="services" title="Sessions">
              <ul className="grid gap-3 sm:grid-cols-2">
                {view.services.map((service) => (
                  <li
                    key={service.id}
                    className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
                  >
                    <p className="font-medium text-ink">{service.title}</p>
                    {service.description ? (
                      <p className="mt-1 line-clamp-3 text-sm text-ink-muted">
                        {service.description}
                      </p>
                    ) : null}
                    <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                      {service.prices.map((price) => (
                        <li
                          key={price.durationMin}
                          className="tabular rounded-full bg-canvas px-2.5 py-0.5 text-ink ring-1 ring-line"
                        >
                          {formatDuration(price.durationMin)} ·{" "}
                          <span className="font-semibold">
                            {formatMoney(price.priceMinor, price.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section id="reviews" title="Reviews">
            {view.reviews.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No reviews yet. Reviews come only from students who had a session with {firstName}.
              </p>
            ) : (
              <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  {view.rating ? (
                    <>
                      <p className="tabular text-4xl font-semibold text-ink">
                        {view.rating.average.toFixed(1)}
                      </p>
                      <Stars rating={Math.round(view.rating.average)} />
                      <p className="mt-1 text-sm text-ink-muted">
                        {pluralize(view.rating.count, "review")}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-ink-muted">An average appears after 3 reviews.</p>
                  )}
                  <ul className="mt-4 space-y-1.5" aria-label="Rating breakdown">
                    {view.histogram.map((bar) => {
                      const pct = view.reviews.length
                        ? Math.round((bar.count / view.reviews.length) * 100)
                        : 0;
                      return (
                        <li
                          key={bar.stars}
                          className="flex items-center gap-2 text-xs text-ink-muted"
                        >
                          <span className="tabular w-3">{bar.stars}</span>
                          <Star className="size-3 fill-accent text-accent" aria-hidden="true" />
                          <span
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
                            aria-hidden="true"
                          >
                            <span
                              className="block h-full rounded-full bg-accent"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span className="tabular w-6 text-right">{bar.count}</span>
                          <span className="sr-only">
                            {pluralize(bar.count, "review")} with {bar.stars} stars
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <ul className="space-y-6">
                  {view.reviews.slice(0, 8).map((review) => (
                    <li
                      key={review.id}
                      className="border-b border-line pb-6 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={review.authorName} seed={review.id} size="sm" />
                          <div>
                            <p className="text-sm font-medium text-ink">{review.authorName}</p>
                            <p className="text-xs text-ink-muted">
                              {formatLongDate(review.publishedAt)}
                            </p>
                          </div>
                        </div>
                        <Stars rating={review.rating} />
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-ink/90">{review.body}</p>
                      {review.response ? (
                        <div className="mt-3 rounded-[var(--radius-control)] border-l-2 border-primary bg-canvas px-4 py-3">
                          <p className="text-xs font-medium text-ink">Response from {firstName}</p>
                          <p className="mt-1 text-sm text-ink/85">{review.response.body}</p>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          {view.events.length > 0 ? (
            <Section id="events" title={`Free events with ${firstName}`}>
              <ul className="grid gap-4 sm:grid-cols-2">
                {view.events.map((event) => (
                  <li key={event.slug}>
                    <EventCard event={event} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <p className="flex items-start gap-1.5 border-t border-line pt-6 text-xs text-ink-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Mentors share personal experience — not official university, immigration, legal or
            financial advice.
          </p>
        </div>

        <aside id="book" aria-label={`Book ${firstName}`} className="lg:sticky lg:top-24 lg:h-fit">
          <BookingArea
            mentor={{
              userId: detail.profile.userId,
              slug,
              firstName,
              timezone: view.timezone,
            }}
            services={view.services}
            maxAdvanceDays={view.maxAdvanceDays}
            policy={view.policy}
            priceLabel={priceLabel}
          />
        </aside>
      </Container>
    </div>
  );
}
