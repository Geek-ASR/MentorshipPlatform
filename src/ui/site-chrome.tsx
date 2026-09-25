import Link from "next/link";
import { brand } from "@/config/brand";
import { Badge } from "./badge";
import { Container } from "./container";
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
    <header className="border-b border-line bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          aria-label={`${brand.name} home`}
          className="rounded-[var(--radius-control)]"
        >
          <Logo />
        </Link>
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-[var(--radius-control)] px-3 py-2 text-sm text-ink-muted hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Badge tone="accent">Early access · in development</Badge>
      </Container>
    </header>
  );
}

const FOOTER_LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#trust", label: "Trust & safety" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/refund-cancellation", label: "Refunds" },
  { href: "/legal/community-guidelines", label: "Community guidelines" },
  { href: "/legal/grievance", label: "Grievance" },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <Container className="grid gap-8 py-10 md:grid-cols-[2fr_3fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-ink-muted">{brand.tagline}</p>
        </div>
        <div className="space-y-4 text-sm text-ink-muted md:text-right">
          <nav aria-label="Legal and trust" className="flex flex-wrap gap-x-4 gap-y-1.5 md:justify-end">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-ink">
                {link.label}
              </Link>
            ))}
          </nav>
          <p>
            Mentors share personal experience. It is not official university, immigration, legal or
            financial advice — always confirm with official sources.
          </p>
          <p className="tabular">
            © {new Date().getUTCFullYear()} {brand.name}. All rights reserved.
          </p>
        </div>
      </Container>
    </footer>
  );
}
