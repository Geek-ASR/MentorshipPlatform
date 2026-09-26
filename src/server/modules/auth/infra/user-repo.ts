import { desc, eq, ilike, inArray, or } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import type { Role, UserStatus } from "@/server/platform/authz/actor";
import { userRoles, users } from "./tables";

export type UserRow = typeof users.$inferSelect;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(
  executor: Executor,
  email: string,
): Promise<UserRow | undefined> {
  const [row] = await executor
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return row;
}

export async function findUserById(executor: Executor, id: string): Promise<UserRow | undefined> {
  const [row] = await executor.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

export async function findUsersByIds(executor: Executor, ids: string[]): Promise<UserRow[]> {
  if (ids.length === 0) return [];
  return executor.select().from(users).where(inArray(users.id, ids));
}

/** docs/06 §7.9 `GET /admin/users` — a plain email/display-name search, most recent first. */
export async function listUsersForAdmin(
  executor: Executor,
  options: { q?: string; limit?: number } = {},
): Promise<UserRow[]> {
  const limit = options.limit ?? 50;
  const query = executor.select().from(users);
  const rows = options.q
    ? await query
        .where(or(ilike(users.email, `%${options.q}%`), ilike(users.displayName, `%${options.q}%`)))
        .orderBy(desc(users.createdAt))
        .limit(limit)
    : await query.orderBy(desc(users.createdAt)).limit(limit);
  return rows;
}

export type NewUser = {
  email: string;
  displayName: string;
  birthYear: number;
  adultAttestedAt: Date;
  countryIso2?: string | null;
  emailVerified?: boolean;
};

export async function insertUser(executor: Executor, input: NewUser): Promise<UserRow> {
  const [row] = await executor
    .insert(users)
    .values({
      id: newId(),
      email: normalizeEmail(input.email),
      displayName: input.displayName.trim(),
      birthYear: input.birthYear,
      adultAttestedAt: input.adultAttestedAt,
      countryIso2: input.countryIso2 ?? null,
      emailVerified: input.emailVerified ?? false,
    })
    .returning();
  return row!;
}

export async function markEmailVerified(executor: Executor, userId: string): Promise<void> {
  await executor.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
}

export async function updateUserEmail(
  executor: Executor,
  userId: string,
  email: string,
): Promise<void> {
  await executor
    .update(users)
    .set({ email: normalizeEmail(email), emailVerified: true })
    .where(eq(users.id, userId));
}

export async function updateUserAccount(
  executor: Executor,
  userId: string,
  changes: { displayName?: string; timezone?: string },
  now: Date,
): Promise<UserRow> {
  const [row] = await executor
    .update(users)
    .set({ ...changes, updatedAt: now })
    .where(eq(users.id, userId))
    .returning();
  return row!;
}

export async function updateUserStatus(
  executor: Executor,
  userId: string,
  status: UserStatus,
): Promise<void> {
  await executor.update(users).set({ status }).where(eq(users.id, userId));
}

export async function rolesForUser(executor: Executor, userId: string): Promise<Role[]> {
  const rows = await executor
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((row) => row.role as Role);
}

export async function grantRole(
  executor: Executor,
  userId: string,
  role: Role,
  grantedBy: string | null,
): Promise<void> {
  await executor
    .insert(userRoles)
    .values({ userId, role, grantedBy })
    .onConflictDoNothing({ target: [userRoles.userId, userRoles.role] });
}
