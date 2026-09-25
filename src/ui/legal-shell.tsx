import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Container } from "./container";

/**
 * Shared chrome for `/legal/*` (docs/12 §15, §17): every legal document here is an engineering
 * draft, not reviewed by a lawyer yet — the same posture docs/12's own header states for the whole
 * compliance doc set. Carrying that banner on the rendered page (not just in `docs/`) keeps the
 * honesty-about-maturity-level promise from the master brief visible to an actual visitor, not just
 * to engineers reading source.
 */
export function LegalDocument({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <Container className="max-w-3xl py-12 md:py-16">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">Draft · last updated {lastUpdated}</p>

      <div
        role="note"
        className="mt-6 flex items-start gap-2 rounded-[var(--radius-card)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-ink"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <p>
          This is a working draft prepared while the product is built, not final legal advice. It
          will be reviewed by a qualified lawyer before the platform accepts real users or real
          payments.
        </p>
      </div>

      <div className="prose-legal mt-8 max-w-[70ch] space-y-6 text-ink [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:text-ink-muted [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </Container>
  );
}
