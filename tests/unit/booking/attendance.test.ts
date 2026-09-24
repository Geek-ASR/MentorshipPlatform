import { describe, expect, it } from "vitest";
import {
  determineAttendanceOutcome,
  determineEventAttendanceOutcome,
  noShowGraceMinutes,
  sessionMentorAbsenceCascadeApplies,
} from "@/server/modules/booking/domain/attendance";

describe("determineAttendanceOutcome (docs/09 §11)", () => {
  it("both silent -> completed", () => {
    expect(
      determineAttendanceOutcome({
        studentClaim: null,
        mentorClaim: null,
        mentorSignaled: false,
        studentSignaled: false,
      }),
    ).toBe("completed");
  });

  it("both explicitly held -> completed", () => {
    expect(
      determineAttendanceOutcome({
        studentClaim: "held",
        mentorClaim: "held",
        mentorSignaled: true,
        studentSignaled: true,
      }),
    ).toBe("completed");
  });

  it("mentor_absent + mentor silent + mentor did NOT signal -> provisional no_show_mentor", () => {
    expect(
      determineAttendanceOutcome({
        studentClaim: "mentor_absent",
        mentorClaim: null,
        mentorSignaled: false,
        studentSignaled: true,
      }),
    ).toBe("provisional_no_show_mentor");
  });

  it("mentor_absent + mentor silent but mentor DID signal -> disputed (conflicting evidence)", () => {
    expect(
      determineAttendanceOutcome({
        studentClaim: "mentor_absent",
        mentorClaim: null,
        mentorSignaled: true,
        studentSignaled: true,
      }),
    ).toBe("disputed");
  });

  it("mentor_absent + mentor explicitly held -> disputed", () => {
    expect(
      determineAttendanceOutcome({
        studentClaim: "mentor_absent",
        mentorClaim: "held",
        mentorSignaled: false,
        studentSignaled: true,
      }),
    ).toBe("disputed");
  });

  it("student silent + student_absent + mentor signaled + student did not -> provisional no_show_student", () => {
    expect(
      determineAttendanceOutcome({
        studentClaim: null,
        mentorClaim: "student_absent",
        mentorSignaled: true,
        studentSignaled: false,
      }),
    ).toBe("provisional_no_show_student");
  });

  it("student explicitly held + student_absent -> disputed", () => {
    expect(
      determineAttendanceOutcome({
        studentClaim: "held",
        mentorClaim: "student_absent",
        mentorSignaled: true,
        studentSignaled: true,
      }),
    ).toBe("disputed");
  });

  it("either party claiming technical_issue takes the technical path, no strikes", () => {
    expect(
      determineAttendanceOutcome({
        studentClaim: "technical_issue",
        mentorClaim: "mentor_absent",
        mentorSignaled: false,
        studentSignaled: false,
      }),
    ).toBe("technical");
    expect(
      determineAttendanceOutcome({
        studentClaim: null,
        mentorClaim: "technical_issue",
        mentorSignaled: false,
        studentSignaled: false,
      }),
    ).toBe("technical");
  });

  it("mutual blame with no signals either way -> disputed", () => {
    expect(
      determineAttendanceOutcome({
        studentClaim: "mentor_absent",
        mentorClaim: "student_absent",
        mentorSignaled: false,
        studentSignaled: false,
      }),
    ).toBe("disputed");
  });
});

describe("noShowGraceMinutes", () => {
  const config = { shortSessionMaxMin: 30, graceShortMin: 10, graceOtherMin: 15 };

  it("30-minute sessions get the short grace window", () => {
    expect(noShowGraceMinutes({ durationMin: 30, ...config })).toBe(10);
  });

  it("longer sessions get the standard grace window", () => {
    expect(noShowGraceMinutes({ durationMin: 60, ...config })).toBe(15);
  });
});

describe("sessionMentorAbsenceCascadeApplies (docs/18 S12, Phase 9)", () => {
  it("applies when any student claims mentor_absent and the mentor never signaled", () => {
    expect(sessionMentorAbsenceCascadeApplies(["held", "mentor_absent"], false)).toBe(true);
  });

  it("does not apply when the mentor did signal, even with a mentor_absent claim", () => {
    expect(sessionMentorAbsenceCascadeApplies(["mentor_absent"], true)).toBe(false);
  });

  it("does not apply when nobody claimed mentor_absent", () => {
    expect(sessionMentorAbsenceCascadeApplies(["held", "technical_issue"], false)).toBe(false);
  });

  it("does not apply with no claims at all", () => {
    expect(sessionMentorAbsenceCascadeApplies([], false)).toBe(false);
  });
});

describe("determineEventAttendanceOutcome (docs/10 §4.2 free_event_no_show)", () => {
  it("a registrant who signaled (joined/checked in) completed the event", () => {
    expect(determineEventAttendanceOutcome({ studentSignaled: true })).toBe("completed");
  });

  it("a registrant with no join/check-in signal is a no-show — no claim, no contest", () => {
    expect(determineEventAttendanceOutcome({ studentSignaled: false })).toBe("no_show_student");
  });
});
