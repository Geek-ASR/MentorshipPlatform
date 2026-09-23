import { describe, expect, it } from "vitest";
import {
  evaluateBookingEligibility,
  type BookingEligibilityInput,
} from "@/server/modules/booking/domain/eligibility";

const now = new Date("2026-01-01T00:00:00.000Z");

const base: BookingEligibilityInput = {
  now,
  studentEmailVerified: true,
  studentAdultAttestation: true,
  studentRestrictedFromBookingCreate: false,
  mentorRestrictedFromBookingAccept: false,
  isSelfBooking: false,
  isBlockedBetweenUsers: false,
  mentorApproved: true,
  mentorListed: true,
  serviceActive: true,
  priceMinor: 0,
  mentorPayoutMode: "volunteer",
  mentorHasActivePayoutAccount: false,
  mentorEligibilityAttestationValid: false,
  durationAllowed: true,
  startsAt: new Date("2026-01-05T00:00:00.000Z"),
  minNoticeMin: 60,
  maxAdvanceDays: 60,
  slotInsideAvailability: true,
  mentorLocalSessionCountToday: 0,
  maxSessionsPerDay: 4,
  studentActiveHoldsCount: 0,
  maxActiveHolds: 3,
  studentExpiredHoldsToday: 0,
  maxExpiredHoldsPerDay: 5,
  studentHasOverlappingHeldOrConfirmedBooking: false,
  studentUpcomingFreeBookingsCount: 0,
  maxUpcomingFreeBookings: 2,
};

describe("evaluateBookingEligibility", () => {
  it("allows a valid free booking", () => {
    expect(evaluateBookingEligibility(base)).toEqual({ eligible: true });
  });

  it("denies unverified email first", () => {
    expect(evaluateBookingEligibility({ ...base, studentEmailVerified: false })).toEqual({
      eligible: false,
      reason: "EMAIL_NOT_VERIFIED",
    });
  });

  it("denies self-booking", () => {
    expect(evaluateBookingEligibility({ ...base, isSelfBooking: true })).toEqual({
      eligible: false,
      reason: "SELF_BOOKING",
    });
  });

  it("does not reveal a block as anything other than NOT_AVAILABLE", () => {
    expect(evaluateBookingEligibility({ ...base, isBlockedBetweenUsers: true })).toEqual({
      eligible: false,
      reason: "NOT_AVAILABLE",
    });
  });

  it("denies an unapproved mentor", () => {
    expect(evaluateBookingEligibility({ ...base, mentorApproved: false })).toEqual({
      eligible: false,
      reason: "MENTOR_UNAVAILABLE",
    });
  });

  it("a paid service is unbookable without an active payout account (Phase 8 gate, docs/19)", () => {
    expect(
      evaluateBookingEligibility({
        ...base,
        priceMinor: 200000,
        mentorPayoutMode: "paid",
        mentorEligibilityAttestationValid: true,
        mentorHasActivePayoutAccount: false,
      }),
    ).toEqual({ eligible: false, reason: "MENTOR_NOT_PAYABLE" });
  });

  it("a paid service is bookable once all three payability facts hold", () => {
    expect(
      evaluateBookingEligibility({
        ...base,
        priceMinor: 200000,
        mentorPayoutMode: "paid",
        mentorEligibilityAttestationValid: true,
        mentorHasActivePayoutAccount: true,
      }),
    ).toEqual({ eligible: true });
  });

  it("free services skip the payability check entirely", () => {
    expect(
      evaluateBookingEligibility({
        ...base,
        priceMinor: 0,
        mentorPayoutMode: "volunteer",
        mentorHasActivePayoutAccount: false,
      }),
    ).toEqual({ eligible: true });
  });

  it("denies a start before min notice", () => {
    expect(
      evaluateBookingEligibility({ ...base, startsAt: new Date("2026-01-01T00:30:00.000Z") }),
    ).toEqual({ eligible: false, reason: "TOO_SOON" });
  });

  it("denies a start beyond max advance", () => {
    expect(
      evaluateBookingEligibility({ ...base, startsAt: new Date("2027-01-01T00:00:00.000Z") }),
    ).toEqual({ eligible: false, reason: "TOO_FAR" });
  });

  it("denies a slot outside availability", () => {
    expect(evaluateBookingEligibility({ ...base, slotInsideAvailability: false })).toEqual({
      eligible: false,
      reason: "OUTSIDE_AVAILABILITY",
    });
  });

  it("denies at the daily session cap", () => {
    expect(
      evaluateBookingEligibility({
        ...base,
        mentorLocalSessionCountToday: 4,
        maxSessionsPerDay: 4,
      }),
    ).toEqual({ eligible: false, reason: "DAILY_LIMIT" });
  });

  it("denies too many active holds", () => {
    expect(
      evaluateBookingEligibility({ ...base, studentActiveHoldsCount: 3, maxActiveHolds: 3 }),
    ).toEqual({ eligible: false, reason: "TOO_MANY_HOLDS" });
  });

  it("denies overlapping bookings", () => {
    expect(
      evaluateBookingEligibility({ ...base, studentHasOverlappingHeldOrConfirmedBooking: true }),
    ).toEqual({ eligible: false, reason: "STUDENT_OVERLAP" });
  });

  it("enforces the free-1:1 anti-abuse limit only for free bookings", () => {
    expect(
      evaluateBookingEligibility({
        ...base,
        priceMinor: 0,
        studentUpcomingFreeBookingsCount: 2,
        maxUpcomingFreeBookings: 2,
      }),
    ).toEqual({ eligible: false, reason: "FREE_BOOKING_LIMIT" });
  });
});
