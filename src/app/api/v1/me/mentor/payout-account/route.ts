import { defineRoute } from "@/server/platform/http/route";
import { authorize, requireVerifiedUser } from "@/server/platform/authz/authorize";
import { AppError } from "@/server/platform/errors";
import { findMentorProfile } from "@/server/modules/profiles";
import {
  createFakeGateway,
  findPayoutAccount,
  onboardMentorPayoutAccount,
} from "@/server/modules/payments";

export const GET = defineRoute(
  { name: "GET /api/v1/me/mentor/payout-account" },
  async ({ actor, getDb }) => {
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const account = await findPayoutAccount(await getDb(), actor.userId);
    return { body: account ?? null };
  },
);

/** Fake onboarding (docs/19 Phase 8 scope) — auto-approves. A real Route adapter would start a KYC
 * flow and leave the account `pending` until an `account.activated` webhook confirms it. */
export const POST = defineRoute(
  { name: "POST /api/v1/me/mentor/payout-account", idempotency: "required" },
  async ({ actor, getDb, clock }) => {
    authorize(actor, requireVerifiedUser, undefined, { now: clock.now() });
    if (actor.kind !== "user") throw new AppError("UNAUTHENTICATED");
    const db = await getDb();
    const mentor = await findMentorProfile(db, actor.userId);
    if (!mentor) throw new AppError("BAD_REQUEST", { detail: "Start a mentor application first." });
    const gateway = createFakeGateway(db);
    const account = await onboardMentorPayoutAccount(db, gateway, actor.userId);
    return { status: 201, body: account };
  },
);
