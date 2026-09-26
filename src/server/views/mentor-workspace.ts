import { asc, eq } from "drizzle-orm";
import type { Database } from "@/server/platform/db/client";
import { countries, taxonomyTerms } from "@/server/platform/db/tables/reference";
import { companies, universities } from "@/server/platform/db/tables/geo";
import {
  checkApplicationCompleteness,
  findMentorProfile,
  getMentorProfileDetail,
  latestAttestation,
  listMentorLinksFor,
  type MentorProfileDetail,
  type MentorProfileRow,
} from "@/server/modules/profiles";
import { listCredentials, type CredentialRow } from "@/server/modules/verification";
import {
  findSchedulingSettings,
  listMentorAvailabilityRules,
  listServicesForMentor,
  type ServiceWithPrices,
} from "@/server/modules/booking";
import { findPayoutAccount, type PayoutAccountRow } from "@/server/modules/payments";

export type SetupStep = {
  id: "application" | "verification" | "services" | "meeting" | "availability" | "payouts";
  title: string;
  description: string;
  done: boolean;
  href: string;
  /** Only applies to paid mentors, for example. */
  applicable: boolean;
};

export type MentorWorkspace = {
  profile: MentorProfileRow;
  detail: MentorProfileDetail;
  completeness: { complete: boolean; missing: string[] };
  credentials: CredentialRow[];
  services: ServiceWithPrices[];
  availabilityRuleCount: number;
  payoutAccount: PayoutAccountRow | undefined;
  steps: SetupStep[];
};

/**
 * Everything the mentor home needs to show where a mentor is in onboarding (docs/22 §3 J2 "status
 * page with checklist"): application, verification, services with a meeting link, availability and
 * — for paid mentors — payouts. Null when no application has been started.
 */
export async function loadMentorWorkspace(
  db: Database,
  userId: string,
): Promise<MentorWorkspace | null> {
  const profile = await findMentorProfile(db, userId);
  if (!profile) return null;
  const [detail, completeness, credentials, services, rules, payoutAccount] = await Promise.all([
    getMentorProfileDetail(db, userId),
    checkApplicationCompleteness(db, userId),
    listCredentials(db, userId),
    listServicesForMentor(db, userId),
    listMentorAvailabilityRules(db, userId),
    findPayoutAccount(db, userId),
  ]);
  if (!detail) return null;

  const activeCredentials = credentials.filter((c) => c.status === "active");
  const activeServices = services.filter((s) => s.isActive && s.kind === "one_on_one");
  const paid = profile.payoutMode === "paid";
  const submitted = profile.applicationStatus !== "draft";
  const steps: SetupStep[] = [
    {
      id: "application",
      title: submitted ? "Application submitted" : "Finish your application",
      description: submitted
        ? profile.applicationStatus === "approved"
          ? "Approved by our team."
          : profile.applicationStatus === "rejected"
            ? "Not approved this time."
            : "Our team reviews every application, usually within a few days."
        : completeness.complete
          ? "Everything's filled in — review and submit it."
          : `Still to do: ${completeness.missing.join(", ")}.`,
      done: submitted,
      href: "/dashboard/mentor/application",
      applicable: true,
    },
    {
      id: "verification",
      title: "Verify an affiliation",
      description:
        activeCredentials.length > 0
          ? `${activeCredentials.length} confirmed.`
          : "Confirm your university or work email. Profiles are listed only with at least one.",
      done: activeCredentials.length > 0,
      href: "/dashboard/mentor/verification",
      applicable: true,
    },
    {
      id: "services",
      title: "Offer a session",
      description:
        activeServices.length > 0
          ? `${activeServices.length} bookable ${activeServices.length === 1 ? "session type" : "session types"}.`
          : "Set what you offer, how long it takes and what it costs.",
      done: activeServices.length > 0,
      href: "/dashboard/mentor/services",
      applicable: true,
    },
    {
      id: "meeting",
      title: "Add a meeting link",
      description: activeServices.every((s) => s.meetingUrl)
        ? "Students can join every session type."
        : "Without one, students have nothing to join.",
      done: activeServices.length > 0 && activeServices.every((s) => s.meetingUrl),
      href: "/dashboard/mentor/services",
      applicable: true,
    },
    {
      id: "availability",
      title: "Set your weekly hours",
      description:
        rules.length > 0
          ? `${rules.length} weekly ${rules.length === 1 ? "window" : "windows"}.`
          : "Students can only book inside the hours you open.",
      done: rules.length > 0,
      href: "/dashboard/mentor/availability",
      applicable: true,
    },
    {
      id: "payouts",
      title: "Set up payouts",
      description:
        payoutAccount?.status === "active"
          ? "Ready to receive earnings."
          : "Needed before paid sessions can be booked.",
      done: payoutAccount?.status === "active",
      href: "/dashboard/mentor/payouts",
      applicable: paid,
    },
  ];

  return {
    profile,
    detail,
    completeness,
    credentials,
    services,
    availabilityRuleCount: rules.length,
    payoutAccount,
    steps,
  };
}

/** Options for the application wizard's selects — small, admin-managed reference lists. */
export async function loadApplicationOptions(db: Database) {
  const [universityRows, companyRows, categoryRows, languageRows, countryRows] = await Promise.all([
    db
      .select({ id: universities.id, name: universities.name })
      .from(universities)
      .orderBy(asc(universities.name)),
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .orderBy(asc(companies.name)),
    db
      .select({ id: taxonomyTerms.id, name: taxonomyTerms.name, parentId: taxonomyTerms.parentId })
      .from(taxonomyTerms)
      .where(eq(taxonomyTerms.vocabulary, "category"))
      .orderBy(asc(taxonomyTerms.name)),
    db
      .select({ id: taxonomyTerms.id, name: taxonomyTerms.name })
      .from(taxonomyTerms)
      .where(eq(taxonomyTerms.vocabulary, "language"))
      .orderBy(asc(taxonomyTerms.sortOrder)),
    db
      .select({ iso2: countries.iso2, name: countries.name })
      .from(countries)
      .where(eq(countries.status, "active"))
      .orderBy(asc(countries.name)),
  ]);
  return { universityRows, companyRows, categoryRows, languageRows, countryRows };
}

/** The application as it stands, for resuming the wizard where the mentor left off. */
export async function loadApplicationDraft(db: Database, userId: string) {
  const [detail, attestation, links] = await Promise.all([
    getMentorProfileDetail(db, userId),
    latestAttestation(db, userId),
    listMentorLinksFor(db, userId),
  ]);
  return { detail, attestation, links };
}

export async function findSchedulingForMentor(db: Database, userId: string) {
  return findSchedulingSettings(db, userId);
}
