import type { Metadata } from "next";
import { Heart } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/server/platform/db/client";
import { getSavedMentorIds } from "@/server/modules/profiles";
import { loadMentorCards } from "@/server/views/mentor-cards";
import { requireViewer } from "@/server/views/viewer";
import { Button } from "@/ui/button";
import { MentorCard } from "@/ui/mentor-card";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";
import { UnsaveButton } from "./unsave-button";

export const metadata: Metadata = { title: "Saved mentors" };

export default async function SavedMentorsPage() {
  const { user } = await requireViewer("/dashboard/saved");
  const db = await getDb();
  const cards = (await loadMentorCards(db, await getSavedMentorIds(db, user.id))).filter(
    (card) => card.isListed,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Saved mentors"
        description="People you'd like to learn from, kept in one place."
        actions={
          <Button asChild variant="secondary">
            <Link href="/mentors">Find more mentors</Link>
          </Button>
        }
      />
      {cards.length === 0 ? (
        <EmptyState
          icon={<Heart className="size-8" aria-hidden="true" />}
          title="No saved mentors yet"
          description="Tap Save on any mentor's profile to keep them here."
          action={
            <Button asChild>
              <Link href="/mentors">Explore mentors</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <li key={card.userId} className="flex flex-col gap-2">
              <MentorCard card={card} className="flex-1" />
              <div className="flex justify-end">
                <UnsaveButton mentorUserId={card.userId} name={card.name.split(" ")[0]!} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
