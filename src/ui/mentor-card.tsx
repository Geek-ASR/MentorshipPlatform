import { BadgeCheck, ChevronRight, Languages, Star } from "lucide-react";
import Link from "next/link";
import type { MentorCardView } from "@/server/views/mentor-cards";
import { Avatar } from "./avatar";
import { cn } from "./cn";
import { formatDuration, formatMoney, formatMonthYear, pluralize } from "./format";

function affiliationLine(card: MentorCardView): string | null {
  if (!card.affiliation) return null;
  const { title, organizationName } = card.affiliation;
  return organizationName ? `${title} · ${organizationName}` : title;
}

export function RatingSummary({
  rating,
  className,
}: {
  rating: MentorCardView["rating"];
  className?: string;
}) {
  if (!rating) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-ink",
          className,
        )}
      >
        New mentor
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm text-ink", className)}>
      <Star className="size-4 fill-accent text-accent" aria-hidden="true" />
      <span className="tabular font-semibold">{rating.average.toFixed(1)}</span>
      <span className="text-ink-muted">({pluralize(rating.count, "review")})</span>
      <span className="sr-only">, rated {rating.average.toFixed(1)} out of 5</span>
    </span>
  );
}

export function PriceLine({ card }: { card: MentorCardView }) {
  if (!card.fromPrice)
    return <span className="text-sm text-ink-muted">Not taking bookings yet</span>;
  const { priceMinor, currency, durationMin } = card.fromPrice;
  if (priceMinor === 0) {
    return (
      <span className="text-sm text-ink">
        <span className="font-semibold text-success">Free</span>
        <span className="text-ink-muted"> · {formatDuration(durationMin)}</span>
      </span>
    );
  }
  return (
    <span className="text-sm text-ink">
      <span className="text-ink-muted">From </span>
      <span className="tabular font-semibold">{formatMoney(priceMinor, currency)}</span>
      <span className="text-ink-muted"> · {formatDuration(durationMin)}</span>
    </span>
  );
}

/** Explore / home card (docs/22 §3 J1) — the whole card is one link to the profile. */
export function MentorCard({ card, className }: { card: MentorCardView; className?: string }) {
  const line = affiliationLine(card);
  return (
    <Link
      href={`/mentors/${card.slug}`}
      className={cn(
        "group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[var(--shadow-lift)]",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <Avatar name={card.name} seed={card.userId} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-ink group-hover:text-primary">
              {card.name}
            </h3>
          </div>
          {line ? <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{line}</p> : null}
          {card.affiliation?.verifiedAt ? (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              {card.affiliation.kind === "work" ? "Work" : "University"} email confirmed ·{" "}
              {formatMonthYear(card.affiliation.verifiedAt)}
            </p>
          ) : null}
        </div>
      </div>

      {card.headline ? (
        <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-ink">{card.headline}</p>
      ) : null}

      {card.expertise.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Can help with">
          {card.expertise.slice(0, 3).map((topic) => (
            <li
              key={topic}
              className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-xs text-ink-muted"
            >
              {topic}
            </li>
          ))}
          {card.expertise.length > 3 ? (
            <li className="px-1 py-0.5 text-xs text-ink-muted">
              +{card.expertise.length - 3} more
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-auto pt-5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-4">
          <PriceLine card={card} />
          <RatingSummary rating={card.rating} />
        </div>
        {card.languages.length > 0 ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-muted">
            <Languages className="size-3.5" aria-hidden="true" />
            {card.languages.join(", ")}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

/** Compact row for side lists (saved mentors, related mentors). */
export function MentorListItem({ card }: { card: MentorCardView }) {
  const line = affiliationLine(card);
  return (
    <Link
      href={`/mentors/${card.slug}`}
      className="group flex items-center gap-3 rounded-[var(--radius-control)] p-2 -mx-2 hover:bg-canvas"
    >
      <Avatar name={card.name} seed={card.userId} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink group-hover:text-primary">
          {card.name}
        </p>
        {line ? <p className="truncate text-xs text-ink-muted">{line}</p> : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
    </Link>
  );
}
