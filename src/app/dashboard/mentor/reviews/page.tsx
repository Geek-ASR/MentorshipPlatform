import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessageSquareQuote, Star } from "lucide-react";
import { getDb } from "@/server/platform/db/client";
import { findMentorProfile } from "@/server/modules/profiles";
import { loadMentorProfile } from "@/server/views/mentor-profile";
import { requireViewer } from "@/server/views/viewer";
import { findReviewResponse } from "@/server/modules/trust";
import { Avatar } from "@/ui/avatar";
import { formatLongDate, pluralize } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";
import { RespondForm } from "./respond-form";

export const metadata: Metadata = { title: "Reviews" };

export default async function MentorReviewsPage() {
  const { user } = await requireViewer("/dashboard/mentor/reviews");
  const db = await getDb();
  const profile = await findMentorProfile(db, user.id);
  if (!profile) redirect("/dashboard/mentor");
  const view = profile.isListed ? await loadMentorProfile(db, profile.slug, new Date()) : null;
  const reviews = view?.reviews ?? [];
  const pendingResponses = await Promise.all(reviews.map((r) => findReviewResponse(db, r.id)));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mentoring"
        title="Reviews"
        description={
          view?.rating
            ? `${view.rating.average.toFixed(1)} average from ${pluralize(view.rating.count, "review")}. Only students who had a session with you can review.`
            : "Only students who had a session with you can review. An average shows after 3 reviews."
        }
      />
      {reviews.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote className="size-8" aria-hidden="true" />}
          title="No reviews yet"
          description="Students are invited to review after each completed session."
        />
      ) : (
        <ul className="space-y-4">
          {reviews.map((review, index) => {
            const response = pendingResponses[index];
            return (
              <li
                key={review.id}
                className="rounded-[var(--radius-card)] border border-line bg-surface p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={review.authorName} seed={review.id} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-ink">{review.authorName}</p>
                      <p className="text-xs text-ink-muted">
                        {formatLongDate(review.publishedAt, user.timezone)}
                      </p>
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1 text-sm font-semibold text-ink"
                    aria-label={`${review.rating} out of 5`}
                  >
                    <Star className="size-4 fill-accent text-accent" aria-hidden="true" />{" "}
                    {review.rating}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink/90">{review.body}</p>
                <div className="mt-4 border-t border-line pt-4">
                  {response ? (
                    <div className="rounded-[var(--radius-control)] border-l-2 border-primary bg-canvas px-4 py-3">
                      <p className="text-xs font-medium text-ink">
                        Your reply{response.status === "published" ? "" : " · waiting for review"}
                      </p>
                      <p className="mt-1 text-sm text-ink/85">{response.body}</p>
                    </div>
                  ) : (
                    <RespondForm reviewId={review.id} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
