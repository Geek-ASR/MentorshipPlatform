import Link from "next/link";
import { listUsersForAdmin } from "@/server/modules/auth";
import { getDb } from "@/server/platform/db/client";
import { requireStaffPage } from "@/server/platform/http/page-actor";
import { CardDescription, CardTitle } from "@/ui/card";
import { Field, Input } from "@/ui/input";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/ui/table";

export const metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireStaffPage(["admin", "super_admin", "moderator", "finance"], "/admin/users");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : undefined;
  const users = await listUsersForAdmin(await getDb(), { q: query });

  return (
    <div>
      <CardTitle className="text-2xl">Users</CardTitle>
      <CardDescription>Search by email or display name.</CardDescription>

      <form method="get" className="mt-4 max-w-sm">
        <Field label="Search" htmlFor="q">
          <Input id="q" name="q" defaultValue={query} placeholder="name@example.com" />
        </Field>
      </form>

      <div className="mt-6">
        <Table>
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {users.map((u) => (
              <Tr key={u.id}>
                <Td>{u.displayName}</Td>
                <Td className="text-xs">{u.email}</Td>
                <Td className="text-xs">{u.status}</Td>
                <Td className="tabular text-xs">{new Date(u.createdAt).toLocaleDateString()}</Td>
                <Td>
                  <Link href={`/admin/users/${u.id}`} className="text-primary hover:underline">
                    View
                  </Link>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    </div>
  );
}
