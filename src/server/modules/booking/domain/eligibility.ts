import type { BookingEligibilityReason } from "./types";

/**
 * Pure eligibility gate for creating a booking (docs/09 §5 table). All facts are pre-loaded by the
 * caller with fresh reads inside the booking transaction — this function makes no I/O decisions,
 * only judges the facts it's given, so it can run once for the advisory check and again for real
 * inside the transaction without duplicating query logic.
 */
export type BookingEligibilityInput = {
  now: Date;
  studentEmailVerified: boolean;
  studentAdultAttestation: boolean;
  studentRestrictedFromBookingCreate: boolean;
  mentorRestrictedFromBookingAccept: boolean;
  isSelfBooking: boolean;
  isBlockedBetweenUsers: boolean;
  mentorApproved: boolean;
  mentorListed: boolean;
  serviceActive: boolean;
  priceMinor: number;
  mentorPayoutMode: "volunteer" | "paid";
  mentorHasActivePayoutAccount: boolean;
  mentorEligibilityAttestationValid: boolean;
  durationAllowed: boolean;
  startsAt: Date;
  minNoticeMin: number;
  maxAdvanceDays: number;
  slotInsideAvailability: boolean;
  mentorLocalSessionCountToday: number;
  maxSessionsPerDay: number;
  studentActiveHoldsCount: number;
  maxActiveHolds: number;
  studentExpiredHoldsToday: number;
  maxExpiredHoldsPerDay: number;
  studentHasOverlappingHeldOrConfirmedBooking: boolean;
  studentUpcomingFreeBookingsCount: number;
  maxUpcomingFreeBookings: number;
};

export type BookingEligibilityResult =
  { eligible: true } | { eligible: false; reason: BookingEligibilityReason };

const deny = (reason: BookingEligibilityReason): BookingEligibilityResult => ({
  eligible: false,
  reason,
});

export function evaluateBookingEligibility(
  input: BookingEligibilityInput,
): BookingEligibilityResult {
  if (!input.studentEmailVerified) return deny("EMAIL_NOT_VERIFIED");
  if (!input.studentAdultAttestation) return deny("AGE_POLICY");

  if (input.studentRestrictedFromBookingCreate) return deny("ACCOUNT_RESTRICTED");
  if (input.mentorRestrictedFromBookingAccept) return deny("ACCOUNT_RESTRICTED");

  if (input.isSelfBooking) return deny("SELF_BOOKING");
  if (input.isBlockedBetweenUsers) return deny("NOT_AVAILABLE");

  if (!input.mentorApproved || !input.mentorListed || !input.serviceActive) {
    return deny("MENTOR_UNAVAILABLE");
  }

  const isFree = input.priceMinor === 0;
  if (!isFree) {
    const payable =
      input.mentorPayoutMode === "paid" &&
      input.mentorHasActivePayoutAccount &&
      input.mentorEligibilityAttestationValid;
    if (!payable) return deny("MENTOR_NOT_PAYABLE");
  }

  if (!input.durationAllowed) return deny("INVALID_DURATION");

  const earliestStart = new Date(input.now.getTime() + input.minNoticeMin * 60_000);
  const latestStart = new Date(input.now.getTime() + input.maxAdvanceDays * 86_400_000);
  if (input.startsAt < earliestStart) return deny("TOO_SOON");
  if (input.startsAt > latestStart) return deny("TOO_FAR");

  if (!input.slotInsideAvailability) return deny("OUTSIDE_AVAILABILITY");
  if (input.mentorLocalSessionCountToday >= input.maxSessionsPerDay) return deny("DAILY_LIMIT");

  if (input.studentActiveHoldsCount >= input.maxActiveHolds) return deny("TOO_MANY_HOLDS");
  if (input.studentExpiredHoldsToday >= input.maxExpiredHoldsPerDay) return deny("TOO_MANY_HOLDS");

  if (input.studentHasOverlappingHeldOrConfirmedBooking) return deny("STUDENT_OVERLAP");

  if (isFree && input.studentUpcomingFreeBookingsCount >= input.maxUpcomingFreeBookings) {
    return deny("FREE_BOOKING_LIMIT");
  }

  return { eligible: true };
}
