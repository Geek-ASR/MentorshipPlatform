import { describe, expect, it } from "vitest";
import {
  canTransition,
  isTerminal,
  transition,
} from "@/server/modules/booking/domain/state-machine";

describe("booking state machine", () => {
  it("moves a held booking to confirmed on payment success", () => {
    expect(transition("held", "payment_succeeded")).toEqual({ to: "confirmed", intents: [] });
  });

  it("releases the calendar block on hold expiry", () => {
    expect(transition("held", "hold_expired")).toEqual({
      to: "expired",
      intents: [{ type: "release_calendar_block" }],
    });
  });

  it("mentor cancellation refunds in full and releases the block", () => {
    const result = transition("confirmed", "mentor_cancel");
    expect(result.to).toBe("cancelled_by_mentor");
    expect(result.intents).toEqual(
      expect.arrayContaining([
        { type: "release_calendar_block" },
        { type: "refund_full", reason: "mentor_cancel" },
      ]),
    );
  });

  it("rejects an event that has no rule from the current state", () => {
    expect(() => transition("completed", "payment_succeeded")).toThrow(/No transition/);
    expect(canTransition("completed", "payment_succeeded")).toBe(false);
  });

  it("walks the full happy path: held -> confirmed -> awaiting_outcome -> completed", () => {
    expect(transition("held", "payment_succeeded").to).toBe("confirmed");
    expect(transition("confirmed", "session_end_reached").to).toBe("awaiting_outcome");
    expect(transition("awaiting_outcome", "attendance_finalized_no_dispute").to).toBe("completed");
  });

  it("disputed can resolve for either side", () => {
    expect(transition("disputed", "dispute_resolved_for_mentor").to).toBe("completed");
    const forStudent = transition("disputed", "dispute_resolved_for_student");
    expect(forStudent.to).toBe("resolved_refunded");
    expect(forStudent.intents).toEqual([
      { type: "refund_full", reason: "dispute_resolved_for_student" },
    ]);
  });

  it("classifies terminal states", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("resolved_refunded")).toBe(true);
    expect(isTerminal("payment_orphaned")).toBe(true);
    expect(isTerminal("confirmed")).toBe(false);
    expect(isTerminal("disputed")).toBe(false);
  });
});
