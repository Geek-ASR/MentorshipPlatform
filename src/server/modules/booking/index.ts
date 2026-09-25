/**
 * Public surface of the booking module (docs/05 §3.3, docs/09, docs/19 Phase 7). Other modules and
 * route handlers depend only on this file — never on `application/*`, `domain/*` or `infra/*`.
 */

export {
  getSchedulingSettings,
  updateSchedulingSettings,
  listMentorAvailabilityRules,
  addMentorAvailabilityRule,
  removeMentorAvailabilityRule,
  listMentorAvailabilityExceptions,
  addMentorAvailabilityException,
  removeMentorAvailabilityException,
} from "./application/scheduling";
export {
  listMyServices,
  createMentorService,
  setMentorServiceActive,
  findService,
  type CreateServiceInput,
} from "./application/services";
export { getAvailableSlots } from "./application/slots";
export { findSchedulingSettings } from "./infra/scheduling-repo";
export { listServicesForMentor, type ServiceWithPrices } from "./infra/service-repo";
export {
  createBooking,
  getBookingForUser,
  type CreateBookingInput,
  type CreateBookingResult,
} from "./application/booking";
export {
  listBookingsForStudent,
  listBookingsForMentor,
  listBookingsForAdmin,
  listBookingsPendingPaymentSync,
  findBooking,
  type BookingRow,
  type BookingWithSession,
} from "./infra/booking-repo";
export { getCancellationQuote, cancelBooking } from "./application/cancellation";
export {
  requestReschedule,
  decideReschedule,
  expirePendingReschedules,
} from "./application/reschedule";
export {
  joinSession,
  checkIn,
  submitAttendanceClaim,
  runAttendanceFinalizer,
} from "./application/attendance";
export { generateBookingIcs, getBookingIcsContent, type BookingIcsInput } from "./application/ics";
export { bookingNotificationJobs } from "./application/notifications";
export { bookingJobs, bookingRecurringJobs } from "./application/jobs";
export { findSession, sessionWindow, type SessionRow } from "./infra/session-repo";
export { listClaimsForBooking } from "./infra/attendance-repo";
export {
  ATTENDANCE_CLAIM_OUTCOMES,
  BOOKING_STATUSES,
  SESSION_KINDS,
  type AttendanceClaimOutcome,
  type BookingStatus,
  type SessionKind,
} from "./domain/types";
export { AVAILABILITY_EXCEPTION_KINDS, type AvailabilityExceptionKind } from "./infra/tables";
export { isValidTimeZone } from "./domain/time";
export { bookings, sessions, mentorServices } from "./infra/tables";
export { transitionBookingStatus } from "./infra/booking-repo";
export { releaseHoldOnCancel } from "./application/booking";
export {
  confirmPaidBooking,
  type ConfirmPaidBookingOutcome,
} from "./application/paid-confirmation";
export { syncPaidBookingsOnce, type SyncPaidBookingsSummary } from "./application/paid-sync";

// --- Phase 9: group sessions, free events, waitlists ---
export {
  previewGroupSeatPricing,
  createGroupSession,
  updateGroupSessionCapacity,
  cancelGroupSession,
  getGroupSessionForMentor,
  sweepOverdueMinParticipantsChecks,
  type CreateGroupSessionInput,
  type SeatPricingPreview,
  type CreateGroupSessionResult,
  type LiveGroupSession,
} from "./application/group-sessions";
export { bookSeat, type BookSeatInput, type BookSeatResult } from "./application/seat-booking";
export {
  joinWaitlist,
  leaveWaitlist,
  listMyWaitlistEntries,
  claimWaitlistOffer,
  expireWaitlistOffersOnce,
} from "./application/waitlist";
export {
  createEvent,
  cancelEvent,
  setEventRecordingUrl,
  createEventInvite,
  listEventInvites,
  listPublicEvents,
  getEventBySlug,
  getEventDetailsForSession,
  type CreateEventInput,
  type CreateEventResult,
  type CreatedInvite,
} from "./application/events";
export { listLiveBookingsForSession, listBookingsForSession } from "./infra/booking-repo";
export { findWaitlistEntry, type WaitlistEntryRow } from "./infra/waitlist-repo";
export {
  findEventBySlug,
  findEventInviteByToken,
  type EventDetailsRow,
  type EventInviteRow,
  type EventWithSession,
} from "./infra/event-repo";
export {
  EVENT_VISIBILITIES,
  RECORDING_VISIBILITIES,
  WAITLIST_ENTRY_STATUSES,
  type EventVisibility,
  type RecordingVisibility,
  type WaitlistEntryStatus,
} from "./domain/types";
