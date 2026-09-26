import { BadgeCheck, CalendarClock, Wallet } from "lucide-react";
import Link from "next/link";
import { brand } from "@/config/brand";
import { Logo } from "@/ui/logo";
import { SkipLink } from "@/ui/site-chrome";

const PROMISES = [
  {
    icon: BadgeCheck,
    title: "Specific, dated verification",
    text: "Badges say what we checked and when — never a vague “verified”.",
  },
  {
    icon: Wallet,
    title: "The full price, upfront",
    text: "What you see before picking a time is what you pay, with a published refund policy.",
  },
  {
    icon: CalendarClock,
    title: "Times in your time zone",
    text: "Every session time is shown in your zone, with the mentor’s alongside.",
  },
];

/** Sign-in, sign-up and the email-link landing pages (docs/19 Phase 15a). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <SkipLink />
      <aside
        aria-label={`About ${brand.name}`}
        className="relative hidden overflow-hidden bg-primary text-on-primary lg:flex lg:flex-col"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.14] [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:22px_22px]"
        />
        <div
          aria-hidden="true"
          className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-on-primary/10 blur-3xl"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 32 32"
          className="absolute -right-10 -bottom-10 size-72 opacity-[0.07]"
        >
          <rect x="3" y="15" width="14" height="14" rx="4" fill="currentColor" />
          <rect x="15" y="3" width="14" height="14" rx="4" fill="currentColor" />
        </svg>
        <div className="relative flex flex-1 flex-col justify-between p-10 xl:p-14">
          <Link href="/" aria-label={`${brand.name} home`} className="w-fit rounded-md">
            <Logo inverse />
          </Link>
          <div className="max-w-md">
            <p className="font-serif text-4xl leading-[1.15] font-semibold tracking-tight xl:text-[2.75rem]">
              {brand.tagline}
            </p>
            <ul className="mt-10 space-y-6">
              {PROMISES.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-on-primary/10 ring-1 ring-on-primary/20">
                    <item.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-sm text-on-primary/80">{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-on-primary/70">
            Mentors share personal experience — not official university, immigration, legal or
            financial advice.
          </p>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex h-16 items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label={`${brand.name} home`} className="rounded-md lg:invisible">
            <Logo />
          </Link>
          <Link href="/" className="text-sm text-ink-muted hover:text-ink">
            Back to {brand.name}
          </Link>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 items-start justify-center px-5 pt-6 pb-16 focus:outline-none sm:items-center sm:px-8"
        >
          <div className="w-full max-w-[420px]">{children}</div>
        </main>
        <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-5 pb-6 text-xs text-ink-muted">
          <Link href="/legal/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/legal/grievance" className="hover:text-ink">
            Help & grievances
          </Link>
          <span className="tabular">
            © {new Date().getUTCFullYear()} {brand.name}
          </span>
        </footer>
      </div>
    </div>
  );
}
