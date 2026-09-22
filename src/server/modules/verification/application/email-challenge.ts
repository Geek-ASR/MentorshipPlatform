import { eq } from "drizzle-orm";
import { brand } from "@/config/brand";
import type { Clock } from "@/server/platform/clock";
import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { randomToken, sha256Hex } from "@/server/platform/crypto";
import { enqueueJob } from "@/server/platform/outbox/outbox";
import { writeAudit } from "@/server/platform/audit";
import { getSetting } from "@/server/platform/settings/settings";
import { sendAuthEmail } from "@/server/modules/auth";
import { findAffiliation, refreshListingFromCredentials } from "@/server/modules/profiles";
import {
  companies,
  companyDomains,
  universities,
  universityDomains,
} from "@/server/platform/db/tables/geo";
import { emailDomainMatches } from "../domain/domain-match";
import { universityEmailLabel, workEmailLabel } from "../domain/labels";
import { countActiveCredentials, issueCredential } from "../infra/credential-repo";
import { findFingerprintOwner, recordFingerprint } from "../infra/fingerprint-repo";
import { consumeRequestToken, createRequest, decideRequest } from "../infra/request-repo";
import type { VerificationMethod } from "../infra/tables";

const CHALLENGE_LINK_TTL_MS = 24 * 60 * 60 * 1000;

type DomainMatch = { organizationName: string; isAlumniDomain: boolean };

/** Resolves the affiliation's registered domains and checks the candidate email against them. */
async function matchAffiliationDomain(
  db: Database,
  affiliation: { kind: string; universityId: string | null; companyId: string | null },
  normalizedEmail: string,
): Promise<{ method: VerificationMethod; match: DomainMatch } | null> {
  if (affiliation.kind === "education" && affiliation.universityId) {
    const [rows, [uni]] = await Promise.all([
      db
        .select({
          domain: universityDomains.domain,
          kind: universityDomains.kind,
          status: universityDomains.status,
        })
        .from(universityDomains)
        .where(eq(universityDomains.universityId, affiliation.universityId)),
      db
        .select({ name: universities.name })
        .from(universities)
        .where(eq(universities.id, affiliation.universityId)),
    ]);
    const hit = rows.find(
      (d) => d.status === "active" && emailDomainMatches(normalizedEmail, d.domain),
    );
    if (!hit || !uni) return null;
    return {
      method: "university_email",
      match: { organizationName: uni.name, isAlumniDomain: hit.kind === "alumni" },
    };
  }
  if (affiliation.kind === "work" && affiliation.companyId) {
    const [rows, [company]] = await Promise.all([
      db
        .select({ domain: companyDomains.domain, status: companyDomains.status })
        .from(companyDomains)
        .where(eq(companyDomains.companyId, affiliation.companyId)),
      db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, affiliation.companyId)),
    ]);
    const hit = rows.find(
      (d) => d.status === "active" && emailDomainMatches(normalizedEmail, d.domain),
    );
    if (!hit || !company) return null;
    return {
      method: "work_email",
      match: { organizationName: company.name, isAlumniDomain: false },
    };
  }
  return null;
}

export type RequestChallengeDeps = { clock: Clock; appBaseUrl: string };

/** Starts the email-challenge (docs/10 §2.4): sends a single-use link to an address at a registered domain. */
export async function requestEmailChallenge(
  db: Database,
  userId: string,
  affiliationId: string,
  email: string,
  deps: RequestChallengeDeps,
): Promise<void> {
  const affiliation = await findAffiliation(db, affiliationId);
  if (!affiliation || affiliation.mentorUserId !== userId) throw new AppError("NOT_FOUND");

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [{ path: "email", code: "invalid", message: "Enter a valid email." }],
    });
  }

  const resolved = await matchAffiliationDomain(db, affiliation, normalizedEmail);
  if (!resolved) {
    throw new AppError("VALIDATION_FAILED", {
      errors: [
        {
          path: "email",
          code: "domain_mismatch",
          message: "This email domain isn't registered to that university or company.",
        },
      ],
    });
  }

  const emailHash = sha256Hex(normalizedEmail);
  const owner = await findFingerprintOwner(db, emailHash);
  if (owner && owner !== userId) {
    throw new AppError("CONFLICT", {
      detail: "This email address is already verified on another account.",
    });
  }

  const now = deps.clock.now();
  const token = randomToken(32);
  await db.transaction(async (tx) => {
    await createRequest(tx, {
      userId,
      affiliationId,
      method: resolved.method,
      challengedEmail: normalizedEmail,
      tokenHash: sha256Hex(token),
      tokenExpiresAt: new Date(now.getTime() + CHALLENGE_LINK_TTL_MS),
    });
    await enqueueJob(tx, sendAuthEmail, {
      to: normalizedEmail,
      subject: `Confirm your email for ${brand.name}`,
      text: `Confirm this address to verify your ${resolved.match.organizationName} affiliation on ${brand.name}:\n\n${deps.appBaseUrl}/verify-affiliation?token=${encodeURIComponent(token)}\n\nThis link expires in 24 hours.`,
    });
  });
}

export type ConfirmChallengeResult = { publicLabel: string; expiresAt: Date };

/** Clicking the challenge link (docs/10 §2.4): auto-approves and issues the scoped credential. */
export async function confirmEmailChallenge(
  db: Database,
  token: string,
  deps: { clock: Clock },
): Promise<ConfirmChallengeResult> {
  const now = deps.clock.now();
  const request = await consumeRequestToken(db, sha256Hex(token), now);
  if (!request)
    throw new AppError("BAD_REQUEST", { detail: "This link is invalid or has expired." });

  const emailHash = sha256Hex(request.challengedEmail);
  const owner = await findFingerprintOwner(db, emailHash);
  if (owner && owner !== request.userId) {
    await decideRequest(db, request.id, "rejected", now);
    throw new AppError("CONFLICT", {
      detail: "This email address is already verified on another account.",
    });
  }

  const affiliation = await findAffiliation(db, request.affiliationId);
  if (!affiliation) throw new AppError("NOT_FOUND");

  const resolved = await matchAffiliationDomain(db, affiliation, request.challengedEmail);
  if (!resolved) {
    // The affiliation's domains changed between request and confirmation — fail closed.
    await decideRequest(db, request.id, "rejected", now);
    throw new AppError("BAD_REQUEST", { detail: "This affiliation could no longer be verified." });
  }

  let publicLabel: string;
  let expiresAt: Date;
  if (resolved.method === "university_email") {
    publicLabel = universityEmailLabel(
      resolved.match.organizationName,
      now,
      resolved.match.isAlumniDomain,
    );
    const expiry = await getSetting(db, "verification.university_email_expiry_days", now);
    const days = resolved.match.isAlumniDomain ? expiry.alumni : expiry.current;
    expiresAt = new Date(now.getTime() + days * 86_400_000);
  } else {
    publicLabel = workEmailLabel(resolved.match.organizationName, now);
    const days = await getSetting(db, "verification.work_email_expiry_days", now);
    expiresAt = new Date(now.getTime() + days * 86_400_000);
  }

  await db.transaction(async (tx) => {
    await issueCredential(tx, {
      userId: request.userId,
      affiliationId: request.affiliationId,
      kind: resolved.method,
      publicLabel,
      verifiedAt: now,
      expiresAt,
    });
    await recordFingerprint(tx, emailHash, request.userId);
    await decideRequest(tx, request.id, "approved", now);
    await writeAudit(tx, {
      actorType: "user",
      actorUserId: request.userId,
      action: "verification.email_challenge_approved",
      targetType: "mentor_affiliation",
      targetId: request.affiliationId,
      metadata: { method: resolved.method },
    });
  });

  const activeCount = await countActiveCredentials(db, request.userId, now);
  await refreshListingFromCredentials(db, request.userId, activeCount);

  return { publicLabel, expiresAt };
}
