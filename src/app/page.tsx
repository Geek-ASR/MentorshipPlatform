import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Briefcase,
  CalendarClock,
  Plane,
  Scale,
  ShieldCheck,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { brand } from "@/config/brand";
import { CATEGORY_TREE } from "@/server/platform/db/seed/taxonomy-data";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardDescription, CardTitle } from "@/ui/card";
import { Container } from "@/ui/container";

function topicsFor(sectionSlug: string, limit: number): string[] {
  const section = CATEGORY_TREE.find((node) => node.slug === sectionSlug);
  const leaves = (section?.children ?? []).flatMap((child) =>
    child.children?.length ? child.children : [child],
  );
  return leaves.slice(0, limit).map((leaf) => leaf.name);
}

const LADDER = [
  {
    icon: BookOpen,
    title: "Free guides",
    price: "Free",
    text: "Country, city and university guides with sources and a last-verified date.",
  },
  {
    icon: Video,
    title: "Free events",
    price: "Free",
    text: "Webinars and workshops hosted by mentors who have done it recently.",
  },
  {
    icon: Users,
    title: "Group sessions",
    price: "Split the cost",
    text: "Share a mentor's hour with a few students working on the same goal.",
  },
  {
    icon: CalendarClock,
    title: "1-on-1 sessions",
    price: "Mentor-set price",
    text: "Focused time on your resume, interviews, applications or move.",
  },
];

const TRUST = [
  {
    icon: BadgeCheck,
    title: "Specific, dated verification",
    text: "Badges say exactly what we checked and when — for example “university email confirmed, March 2026” — never a vague “verified”.",
  },
  {
    icon: Wallet,
    title: "Payment protection",
    text: "The full price is shown upfront. If a session doesn't happen, the published refund policy applies — no chasing anyone.",
  },
  {
    icon: ShieldCheck,
    title: "Reliability you can see",
    text: "Mentors' session-held rate is visible, and no-shows follow a fair, published policy with appeals.",
  },
  {
    icon: Scale,
    title: "Experience, not official advice",
    text: "Mentors share what worked for them. Visa, legal and financial decisions always point back to official sources.",
  },
];

export default function HomePage() {
  const careerTopics = topicsFor("career-academic", 8);
  const abroadTopics = topicsFor("study-abroad", 8);

  return (
    <>
      <section aria-labelledby="hero-title" className="border-b border-line">
        <Container className="grid gap-10 py-16 md:py-24 lg:grid-cols-[3fr_2fr] lg:items-center">
          <div>
            <Badge tone="primary">For students in India and beyond</Badge>
            <h1
              id="hero-title"
              className="mt-5 max-w-2xl font-serif text-4xl leading-tight font-semibold tracking-tight text-ink sm:text-5xl"
            >
              {brand.tagline}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-muted">
              Affordable mentorship from professionals, alumni and researchers who recently landed
              the job, cleared the interview or moved to the city you are heading to.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/#how-it-works">
                  See how it works <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/#mentors">Mentor with us</Link>
              </Button>
            </div>
          </div>
          <Card className="p-0" aria-label="Example of how a session is presented">
            <div className="border-b border-line p-5">
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                Example session view
              </p>
              <p className="mt-2 font-semibold text-ink">MSc applications to German universities</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="primary">
                  <BadgeCheck className="size-3.5" aria-hidden="true" /> University email confirmed
                  · Mar 2026
                </Badge>
                <Badge>Speaks English, Hindi</Badge>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
              <div>
                <dt className="text-ink-muted">Your time</dt>
                <dd className="tabular font-medium text-ink">Fri · 14:30–15:30 IST</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Mentor&apos;s time</dt>
                <dd className="tabular font-medium text-ink">11:00–12:00 CEST</dd>
              </div>
              <div className="col-span-2 border-t border-line pt-4">
                <dt className="text-ink-muted">Price shown upfront</dt>
                <dd className="font-medium text-ink">
                  Total including all fees, before you pick a slot
                </dd>
              </div>
            </dl>
          </Card>
        </Container>
      </section>

      <section id="paths" aria-labelledby="paths-title" className="scroll-mt-20 py-16 md:py-20">
        <Container>
          <h2 id="paths-title" className="text-3xl font-semibold tracking-tight text-ink">
            Two paths, one trusted place
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {[
              {
                icon: Briefcase,
                title: "Career & academic",
                description: "From placements and interviews to research and portfolios.",
                topics: careerTopics,
              },
              {
                icon: Plane,
                title: "Study abroad",
                description:
                  "Admissions, the visa process as others experienced it, housing and life in a new city.",
                topics: abroadTopics,
              },
            ].map((path) => (
              <Card key={path.title}>
                <path.icon className="size-6 text-primary" aria-hidden="true" />
                <CardTitle className="mt-4">{path.title}</CardTitle>
                <CardDescription>{path.description}</CardDescription>
                <ul className="mt-5 flex flex-wrap gap-2" aria-label={`${path.title} topics`}>
                  {path.topics.map((topic) => (
                    <li key={topic}>
                      <Badge>{topic}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      <section
        id="how-it-works"
        aria-labelledby="how-title"
        className="scroll-mt-20 border-y border-line bg-surface py-16 md:py-20"
      >
        <Container>
          <h2 id="how-title" className="text-3xl font-semibold tracking-tight text-ink">
            Start free. Pay only when it&apos;s worth it.
          </h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            Every step up is optional, and every price is visible before you commit.
          </p>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {LADDER.map((step, index) => (
              <li
                key={step.title}
                className="relative rounded-[var(--radius-card)] border border-line bg-canvas p-5"
              >
                <span className="tabular text-xs font-medium text-ink-muted">Step {index + 1}</span>
                <step.icon className="mt-3 size-6 text-primary" aria-hidden="true" />
                <h3 className="mt-3 font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm font-medium text-primary">{step.price}</p>
                <p className="mt-2 text-sm text-ink-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section id="trust" aria-labelledby="trust-title" className="scroll-mt-20 py-16 md:py-20">
        <Container>
          <h2 id="trust-title" className="text-3xl font-semibold tracking-tight text-ink">
            Built on trust from day one
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {TRUST.map((item) => (
              <div key={item.title} className="flex gap-4">
                <item.icon className="mt-1 size-6 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section id="mentors" aria-labelledby="mentors-title" className="scroll-mt-20">
        <Container>
          <div className="rounded-[var(--radius-sheet)] bg-primary px-6 py-12 text-on-primary sm:px-10">
            <h2 id="mentors-title" className="text-3xl font-semibold tracking-tight">
              Help the students one step behind you
            </h2>
            <p className="mt-3 max-w-2xl opacity-90">
              We are preparing a small founding-mentor group of professionals, alumni and
              researchers. Current international students can join as volunteer mentors and event
              hosts where their visa conditions don&apos;t allow paid work.
            </p>
            <p className="mt-6 text-sm font-medium opacity-90">
              Mentor applications open with the beta.
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
