import Link from "next/link";
import { brand } from "@/config/brand";
import { Container } from "./container";
import { HeaderActions, PrimaryNav } from "./header-actions";
import { Logo } from "./logo";

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:shadow"
    >
      Skip to content
    </a>
  );
}

const NAV = [
  { href: "/mentors", label: "Explore mentors" },
  { href: "/career", label: "Career" },
  { href: "/study-abroad", label: "Study abroad" },
  { href: "/guides", label: "Guides" },
  { href: "/events", label: "Free events" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/70">
      <Container className="flex h-16 items-center gap-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label={`${brand.name} home`}
            className="rounded-[var(--radius-control)]"
          >
            <Logo />
          </Link>
          <span className="hidden rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-ink sm:inline">
            Early access
          </span>
        </div>
        <PrimaryNav items={NAV} />
        <div className="ml-auto flex items-center gap-2">
          <HeaderActions nav={NAV} />
        </div>
      </Container>
    </header>
  );
}

const FOOTER_COLUMNS = [
  {
    title: "Explore",
    links: [
      { href: "/mentors", label: "Find a mentor" },
      { href: "/events", label: "Free events" },
      { href: "/guides", label: "Guides" },
      { href: "/career", label: "Career & academic" },
      { href: "/study-abroad", label: "Study abroad" },
    ],
  },
  {
    title: "Mentors",
    links: [
      { href: "/sign-up?intent=mentor", label: "Become a mentor" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/legal/community-guidelines", label: "Community guidelines" },
    ],
  },
  {
    title: "Trust & legal",
    links: [
      { href: "/#trust", label: "Trust & safety" },
      { href: "/legal/refund-cancellation", label: "Refunds & cancellations" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/grievance", label: "Grievances" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-ink-muted">{brand.tagline}</p>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-ink-muted">
            Mentors share personal experience. It is not official university, immigration, legal or
            financial advice — always confirm with official sources.
          </p>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="text-sm font-semibold text-ink">{column.title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-ink-muted hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-line">
        <Container className="flex flex-col gap-2 py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="tabular">
            © {new Date().getUTCFullYear()} {brand.name}. All rights reserved.
          </p>
          <p>Early access: {brand.name} is still being built, and payments run in test mode.</p>
        </Container>
      </div>
    </footer>
  );
}
