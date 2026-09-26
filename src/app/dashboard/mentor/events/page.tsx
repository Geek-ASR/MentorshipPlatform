import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/platform/db/client";
import { loadHostingWorkspace, type HostedItem } from "@/server/views/hosting";
import { requireViewer } from "@/server/views/viewer";
import { PageHeader } from "@/ui/page-header";
import { HostingManager, type HostedItemView } from "./hosting-manager";

export const metadata: Metadata = { title: "Events & group sessions" };

function toView(item: HostedItem): HostedItemView {
  return { ...item, start: item.start.toISOString(), end: item.end.toISOString() };
}

export default async function MentorEventsPage() {
  const { user, actor } = await requireViewer("/dashboard/mentor/events");
  const workspace = await loadHostingWorkspace(await getDb(), user.id, actor.roles, new Date());
  if (!workspace) redirect("/dashboard/mentor");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mentoring"
        title="Events & group sessions"
        description="Reach several students at once — free events to share what you know, or small paid groups."
      />
      <HostingManager
        timeZone={user.timezone}
        canHostEvents={workspace.canHostEvents}
        groupBlocker={workspace.groupBlocker}
        limits={workspace.limits}
        upcoming={workspace.upcoming.map(toView)}
        past={workspace.past.map(toView)}
      />
    </div>
  );
}
