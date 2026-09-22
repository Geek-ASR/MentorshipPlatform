import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { userConsents, type ConsentKind } from "./tables";

export async function recordConsent(
  executor: Executor,
  input: { userId: string; kind: ConsentKind; version: string; ipPrefix: string | null },
): Promise<void> {
  await executor.insert(userConsents).values({
    id: newId(),
    userId: input.userId,
    kind: input.kind,
    version: input.version,
    ipPrefix: input.ipPrefix,
  });
}
