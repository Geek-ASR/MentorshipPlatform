import Link from "next/link";
import { ARTICLE_STATUSES, listArticlesForAdmin, type ArticleStatus } from "@/server/modules/content";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { CardDescription, CardTitle } from "@/ui/card";
import { EmptyState } from "@/ui/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";

export const metadata = { title: "Articles & guides" };

type SearchParams = { status?: string; due?: string };

const STATUS_TONE: Record<ArticleStatus, "primary" | "neutral" | "accent"> = {
  draft: "neutral",
  published: "primary",
  archived: "neutral",
};

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireStaffPage(["content_editor", "admin", "super_admin"], "/admin/articles");
  const params = await searchParams;
  const dueForReview = params.due === "1";
  const status =
    !dueForReview && params.status && (ARTICLE_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as ArticleStatus)
      : undefined;

  const articles = await listArticlesForAdmin(await getDb(), { status, dueForReview });

  const tabs: { label: string; href: string; active: boolean }[] = [
    { label: "All", href: "/admin/articles", active: !status && !dueForReview },
    ...ARTICLE_STATUSES.map((s) => ({
      label: s,
      href: `/admin/articles?status=${s}`,
      active: status === s,
    })),
    { label: "Due for review", href: "/admin/articles?due=1", active: dueForReview },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <CardTitle className="text-2xl">Articles & guides</CardTitle>
          <CardDescription>
            Country, city, university and career guides (docs/12 §14: sourced, dated, review-due).
          </CardDescription>
        </div>
        <Button asChild>
          <Link href="/admin/articles/new">New guide</Link>
        </Button>
      </div>

      <nav aria-label="Filter" className="mt-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              tab.active
                ? "rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-on-primary"
                : "rounded-full border border-line px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {articles.length === 0 ? (
          <EmptyState
            title="No guides here yet"
            description="Guides need at least one source before they can be published."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th>Source type</Th>
                <Th>Last verified</Th>
                <Th>Review due</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {articles.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <p className="font-medium text-ink">{a.title}</p>
                    <p className="text-xs text-ink-muted">/guides/{a.slug}</p>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
                  </Td>
                  <Td className="text-xs">{a.sourceType.replace("_", " ")}</Td>
                  <Td className="tabular text-xs">
                    {a.lastVerifiedAt ? new Date(a.lastVerifiedAt).toLocaleDateString("en-GB") : "—"}
                  </Td>
                  <Td className="tabular text-xs">
                    {a.nextReviewDueAt ? new Date(a.nextReviewDueAt).toLocaleDateString("en-GB") : "—"}
                  </Td>
                  <Td>
                    <Link href={`/admin/articles/${a.id}`} className="text-sm text-primary hover:underline">
                      Edit
                    </Link>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
