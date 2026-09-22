/**
 * Public surface of the profiles module (docs/05 §3.1, docs/19 Phase 6). Other modules and route
 * handlers depend only on this file — never on `application/*`, `domain/*` or `infra/*` directly.
 */

export { saveStudentProfile, getStudentProfile } from "./application/student";
export {
  startMentorApplication,
  updateMentorContent,
  addMentorAffiliation,
  removeMentorAffiliation,
  setMentorExpertise,
  setMentorLanguages,
  addMentorLink,
  removeMentorLink,
  listMentorLinksFor,
  submitEligibilityAttestation,
  checkApplicationCompleteness,
  submitMentorApplication,
  reviewMentorApplication,
  type AffiliationInput,
  type LanguageInput,
  type ApplicationDecision,
  type ApplicationCompleteness,
} from "./application/mentor-application";
export { refreshListingFromCredentials } from "./application/search-index";
export { searchMentors, type MentorCard, type SearchResults } from "./application/search";
export {
  getMentorProfileDetail,
  getMentorProfileDetailBySlug,
  type MentorProfileDetail,
} from "./application/mentor-detail";
export { toMentorProfilePageDto, type MentorProfilePageDto } from "./application/dtos";
export { toggleSavedMentor, getSavedMentorIds, checkIsSaved } from "./application/saved-mentors";

export {
  findMentorProfile,
  findMentorProfileBySlug,
  type MentorProfileRow,
} from "./infra/mentor-repo";
export { findAffiliation, type MentorAffiliationRow } from "./infra/affiliation-repo";
export { mentorAffiliations, mentorProfiles } from "./infra/tables";
export {
  AFFILIATION_KINDS,
  MENTOR_APPLICATION_STATUSES,
  MENTOR_LINK_KINDS,
  LANGUAGE_PROFICIENCIES,
  RESIDENCY_STATUSES,
  STUDENT_VISIBILITIES,
  type AffiliationKind,
  type MentorApplicationStatus,
  type MentorLinkKind,
  type LanguageProficiency,
  type ResidencyStatus,
  type PayoutMode,
} from "./infra/tables";

export type { SearchFilters } from "./infra/search-repo";
