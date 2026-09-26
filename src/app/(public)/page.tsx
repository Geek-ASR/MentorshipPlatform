import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Briefcase,
  CalendarClock,
  Plane,
  Scale,
  Search,
  ShieldCheck,
  Star,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { brand } from "@/config/brand";
import { getDb } from "@/server/platform/db/client";
import { CATEGORY_TREE } from "@/server/platform/db/seed/taxonomy-data";
import { loadHomeData } from "@/server/views/home";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { Container } from "@/ui/container";
import { EventCard } from "@/ui/event-card";
import { formatLongDate } from "@/ui/format";
import { MentorCard, PriceLine } from "@/ui/mentor-card";

/** Live mentors, events and guides — refreshed every few minutes rather than per request. */
export const revalidate = 300;

function topicsFor(sectionSlug: string, limit: number): string[] {
  const section = CATEGORY_TREE.find((node) => node.slug === sectionSlug);
  const leaves = (section?.children ?? []).flatMap((child) =>
    child.children?.length ? child.children : [child],
  );
  return leaves.slice(0, limit).map((leaf) => leaf.name);
}

const POPULAR_SEARCHES = [
  "Germany MSc applications",
  "System design",
  "Resume review",
  "APS certificate",
  "Data science",
];

const LADDER = [
  {
    icon: BookOpen,
    title: "Read a guide",
    price: "Free",
    text: "Country, city and university guides with sources and a last-verified date.",
  },
  {
    icon: Video,
    title: "Join a free event",
    price: "Free",
    text: "Live Q&As and workshops hosted by mentors who did it recently.",
  },
  {
    icon: Users,
    title: "Share a group session",
    price: "Split the cost",
    text: "A mentor's hour, shared with a few students working on the same goal.",
  },
  {
    icon: CalendarClock,
    title: "Book 1-on-1",
    price: "Price set by the mentor",
    text: "Focused time on your resume, interviews, applications or move.",
  },
];

const TRUST = [
  {
    icon: BadgeCheck,
    title: "Specific, dated verification",
    text: "Badges say exactly what we checked and when — “university email confirmed, July 2026” — never a vague “verified”.",
  },
  {
    icon: Wallet,
    title: "Payment protection",
    text: "The full price is shown upfront. If a session doesn't happen, the published refund policy applies — no chasing anyone.",
  },
  {
    icon: ShieldCheck,
    title: "Reliability you can see",
    text: "Each mentor's session-held rate is public, and no-shows follow a fair, published policy with appeals.",
  },
  {
    icon: Scale,
    title: "Experience, not official advice",
    text: "Mentors share what worked for them. Visa, legal and financial decisions always point back to official sources.",
  },
];

export default async function HomePage() {
  const data = await loadHomeData(await getDb(), new Date());
  const careerTopics = topicsFor("career-academic", 6);
  const abroadTopics = topicsFor("study-abroad", 6);

  return (
    <>
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden border-b border-line"
      >
        <div
          aria-hidden="true"
          className="bg-dots absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        />
        <div
          aria-hidden="true"
          className="absolute -top-40 right-[-10%] size-[36rem] rounded-full bg-primary-soft blur-3xl"
        />
        <Container className="relative grid grid-cols-1 gap-12 py-16 md:py-24 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-muted">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
              For students in India and beyond
            </p>
            <h1
              id="hero-title"
              className="mt-6 max-w-2xl font-serif text-[2.6rem] leading-[1.08] font-semibold tracking-tight text-ink sm:text-6xl"
            >
              Guidance from people who&apos;ve{" "}
              <span className="whitespace-nowrap text-primary">been there.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
              Affordable mentorship from professionals, alumni and researchers who recently landed
              the job, cleared the interview or moved to the city you&apos;re heading to.
            </p>

            <form action="/mentors" method="GET" role="search" className="mt-8 max-w-xl">
              <label htmlFor="hero-search" className="sr-only">
                What do you need help with?
              </label>
              <div className="flex gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-2 shadow-[var(--shadow-lift)]">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-muted"
                    aria-hidden="true"
                  />
                  <input
                    id="hero-search"
                    type="search"
                    name="q"
                    placeholder="University, company or topic"
                    className="h-12 w-full rounded-[var(--radius-control)] bg-transparent pr-3 pl-11 text-base text-ink placeholder:text-ink-muted/80 focus-visible:outline-none"
                  />
                </div>
                <Button type="submit" size="lg">
                  Find mentors
                </Button>
              </div>
            </form>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-muted">Popular:</span>
              {POPULAR_SEARCHES.map((topic) => (
                <Link
                  key={topic}
                  href={`/mentors?q=${encodeURIComponent(topic)}`}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-ink-muted transition-colors hover:border-primary/40 hover:text-ink"
                >
                  {topic}
                </Link>
              ))}
            </div>
          </div>

          {data.heroMentors.length >= 3 ? (
            <div className="relative mx-auto w-full max-w-md lg:mr-0">
              <div className="rounded-[var(--radius-sheet)] border border-line bg-surface p-2 shadow-[var(--shadow-overlay)]">
                <p className="px-4 pt-3 pb-2 text-xs font-medium tracking-wide text-ink-muted uppercase">
                  Meet a few of our mentors
                </p>
                <ul className="divide-y divide-line">
                  {data.heroMentors.map((mentor) => (
                    <li key={mentor.userId}>
                      <Link
                        href={`/mentors/${mentor.slug}`}
                        className="flex items-center gap-4 rounded-[var(--radius-card)] p-4 transition-colors hover:bg-canvas"
                      >
                        <Avatar name={mentor.name} seed={mentor.userId} size="lg" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-ink">{mentor.name}</p>
                          <p className="truncate text-sm text-ink-muted">
                            {mentor.affiliation
                              ? [mentor.affiliation.title, mentor.affiliation.organizationName]
                                  .filter(Boolean)
                                  .join(" · ")
                              : mentor.headline}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {mentor.affiliation?.verifiedAt ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                                <BadgeCheck className="size-3.5" aria-hidden="true" /> Verified
                              </span>
                            ) : null}
                            {mentor.rating ? (
                              <span className="inline-flex items-center gap-1 text-xs text-ink">
                                <Star
                                  className="size-3.5 fill-accent text-accent"
                                  aria-hidden="true"
                                />
                                <span className="tabular font-semibold">
                                  {mentor.rating.average.toFixed(1)}
                                </span>
                                <span className="sr-only">out of 5</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="hidden shrink-0 text-right sm:block">
                          <PriceLine card={mentor} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/mentors"
                  className="m-2 flex items-center justify-center gap-1 rounded-[var(--radius-control)] bg-canvas py-3 text-sm font-medium text-primary hover:bg-primary-soft"
                >
                  Browse all mentors <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          ) : null}
        </Container>
      </section>

      {data.organizations.length >= 4 ? (
        <section
          aria-label="Where our mentors studied and work"
          className="border-b border-line bg-surface"
        >
          <Container className="py-8">
            <p className="text-center text-xs font-medium tracking-wide text-ink-muted uppercase">
              Mentors with confirmed affiliations at
            </p>
            <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[15px] font-medium text-ink/75">
              {data.organizations.map((org, index) => (
                <li key={org} className="flex items-center gap-3">
                  {index > 0 ? (
                    <span aria-hidden="true" className="text-line">
                      •
                    </span>
                  ) : null}
                  {org}
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      <section id="paths" aria-labelledby="paths-title" className="scroll-mt-20 py-16 md:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2
              id="paths-title"
              className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
            >
              Two paths, one trusted place
            </h2>
            <p className="mt-3 text-lg text-ink-muted">
              Whether you&apos;re preparing for placements or planning a move abroad.
            </p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {[
              {
                icon: Briefcase,
                title: "Career & academic",
                href: "/career",
                description: "From placements and interviews to research and portfolios.",
                topics: careerTopics,
                tone: "bg-primary-soft text-primary",
              },
              {
                icon: Plane,
                title: "Study abroad",
                href: "/study-abroad",
                description:
                  "Admissions, the visa process as others experienced it, housing and life in a new city.",
                topics: abroadTopics,
                tone: "bg-accent-soft text-ink",
              },
            ].map((path) => (
              <Link
                key={path.title}
                href={path.href}
                className="group flex h-full flex-col rounded-[var(--radius-sheet)] border border-line bg-surface p-7 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[var(--shadow-lift)]"
              >
                <span
                  className={`flex size-12 items-center justify-center rounded-[var(--radius-card)] ${path.tone}`}
                >
                  <path.icon className="size-6" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-semibold text-ink group-hover:text-primary">
                  {path.title}
                </h3>
                <p className="mt-2 text-ink-muted">{path.description}</p>
                <ul className="mt-6 flex flex-wrap gap-2" aria-label={`${path.title} topics`}>
                  {path.topics.map((topic) => (
                    <li
                      key={topic}
                      className="rounded-full border border-line bg-canvas px-3 py-1 text-sm text-ink-muted"
                    >
                      {topic}
                    </li>
                  ))}
                </ul>
                <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Explore {path.title.toLowerCase()}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {data.featured.length > 0 ? (
        <section
          aria-labelledby="mentors-title"
          className="border-y border-line bg-surface py-16 md:py-24"
        >
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <h2
                  id="mentors-title"
                  className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
                >
                  Mentors who were in your shoes
                </h2>
                <p className="mt-3 text-lg text-ink-muted">
                  Reviewed by our team, with affiliations confirmed through their university or work
                  email.
                </p>
              </div>
              <Button asChild variant="secondary">
                <Link href="/mentors">
                  See all mentors <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.featured.map((card) => (
                <li key={card.userId}>
                  <MentorCard card={card} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      <section
        id="how-it-works"
        aria-labelledby="how-title"
        className="scroll-mt-20 py-16 md:py-24"
      >
        <Container>
          <div className="max-w-2xl">
            <h2
              id="how-title"
              className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
            >
              Start free. Pay only when it&apos;s worth it.
            </h2>
            <p className="mt-3 text-lg text-ink-muted">
              Every step up is optional, and every price is visible before you commit.
            </p>
          </div>
          <ol className="relative mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            <div
              aria-hidden="true"
              className="absolute top-6 right-[12%] left-[12%] hidden h-px bg-line lg:block"
            />
            {LADDER.map((step, index) => (
              <li key={step.title} className="relative">
                <span className="relative flex size-12 items-center justify-center rounded-full border border-line bg-surface text-primary shadow-sm">
                  <step.icon className="size-5" aria-hidden="true" />
                </span>
                <p className="tabular mt-5 text-xs font-medium tracking-wide text-ink-muted uppercase">
                  Step {index + 1} · <span className="text-primary">{step.price}</span>
                </p>
                <h3 className="mt-1.5 text-lg font-semibold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {data.events.length > 0 ? (
        <section aria-labelledby="events-title" className="pb-16 md:pb-24">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <h2
                  id="events-title"
                  className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
                >
                  Upcoming free events
                </h2>
                <p className="mt-3 text-lg text-ink-muted">
                  Live and free — ask questions, hear what worked, then decide what you need.
                </p>
              </div>
              <Button asChild variant="secondary">
                <Link href="/events">
                  All events <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <ul className="mt-10 grid gap-5 md:grid-cols-3">
              {data.events.map((event) => (
                <li key={event.slug}>
                  <EventCard event={event} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      <section
        id="trust"
        aria-labelledby="trust-title"
        className="scroll-mt-20 border-y border-line bg-surface py-16 md:py-24"
      >
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2
              id="trust-title"
              className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
            >
              Built on trust from day one
            </h2>
            <p className="mt-3 text-lg text-ink-muted">
              Clear rules for everyone — published before you ever pay.
            </p>
            <Link
              href="/legal/refund-cancellation"
              className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Read the refund & cancellation policy{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {TRUST.map((item) => (
              <div key={item.title}>
                <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <item.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{item.text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {data.guides.length > 0 ? (
        <section aria-labelledby="guides-title" className="py-16 md:py-24">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <h2
                  id="guides-title"
                  className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
                >
                  Guides, sourced and dated
                </h2>
                <p className="mt-3 text-lg text-ink-muted">
                  Written from real experience, with links to official sources and a last-verified
                  date on every page.
                </p>
              </div>
              <Button asChild variant="secondary">
                <Link href="/guides">
                  All guides <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <ul className="mt-10 grid gap-5 md:grid-cols-3">
              {data.guides.map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={`/guides/${guide.slug}`}
                    className="group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-6 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[var(--shadow-lift)]"
                  >
                    <BookOpen className="size-5 text-primary" aria-hidden="true" />
                    <h3 className="mt-4 font-serif text-xl leading-snug font-semibold text-ink group-hover:text-primary">
                      {guide.title}
                    </h3>
                    {guide.dek ? (
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">
                        {guide.dek}
                      </p>
                    ) : null}
                    {guide.lastVerifiedAt ? (
                      <p className="mt-auto pt-5 text-xs text-ink-muted">
                        Last verified {formatLongDate(guide.lastVerifiedAt)}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      <section id="mentors" aria-labelledby="mentor-cta-title" className="scroll-mt-20">
        <Container>
          <div className="relative overflow-hidden rounded-[var(--radius-sheet)] bg-primary px-6 py-14 text-on-primary sm:px-12">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:22px_22px]"
            />
            <div className="relative grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-center">
              <div>
                <h2
                  id="mentor-cta-title"
                  className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl"
                >
                  Help the students one step behind you
                </h2>
                <p className="mt-4 max-w-2xl text-lg text-on-primary/85">
                  Professionals, alumni and researchers set their own prices and hours. Current
                  international students can mentor as volunteers or host free events where their
                  visa doesn&apos;t allow paid work.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 lg:justify-end">
                <Button asChild size="lg" variant="accent">
                  <Link href="/sign-up?intent=mentor">Become a mentor</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-on-primary hover:bg-on-primary/10"
                >
                  <Link href="/legal/community-guidelines">Mentor guidelines</Link>
                </Button>
              </div>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-ink-muted">
            {brand.name} is in early access — everything you see is being built in the open.
          </p>
        </Container>
      </section>
    </>
  );
}
