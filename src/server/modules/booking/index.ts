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
