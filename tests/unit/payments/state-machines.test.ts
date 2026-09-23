import { describe, expect, it } from "vitest";
import {
  canTransitionRefund,
  canTransitionTransfer,
  resolvePaymentTransition,
  transitionIntent,
  transitionRefund,
  transitionTransfer,
} from "@/server/modules/payments/domain/state-machines";

describe("payment intent state machine", () => {
  it("walks the happy path: created -> pending -> succeeded", () => {
    expect(transitionIntent("created", "provider_order_created")).toBe("pending");
    expect(transitionIntent("pending", "capture_verified")).toBe("succeeded");
  });

  it("supports late capture after expiry or cancellation", () => {
    expect(transitionIntent("expired", "late_capture_verified")).toBe("succeeded");
    expect(transitionIntent("cancelled", "late_capture_verified")).toBe("succeeded");
  });

  it("rejects an event with no rule from the current state", () => {
    expect(() => transitionIntent("succeeded", "capture_verified")).toThrow(
      /No payment_intent transition/,
    );
  });
});

describe("payment status resolution (docs/08 §6.4 out-of-order webhooks)", () => {
  it("applies a valid forward transition", () => {
    expect(resolvePaymentTransition("authorized", "captured")).toEqual({
      kind: "apply",
      to: "captured",
    });
  });

  it("treats a delayed earlier-rank event as stale, not an error", () => {
    expect(resolvePaymentTransition("captured", "authorized")).toEqual({ kind: "stale" });
  });

  it("treats a repeated identical event as stale", () => {
    expect(resolvePaymentTransition("captured", "captured")).toEqual({ kind: "stale" });
  });

  it("applies a dispute won/lost even though it moves rank backwards or repeats", () => {
    expect(resolvePaymentTransition("captured", "disputed")).toEqual({
      kind: "apply",
      to: "disputed",
    });
    expect(resolvePaymentTransition("disputed", "captured")).toEqual({
      kind: "apply",
      to: "captured",
    });
    expect(resolvePaymentTransition("disputed", "refunded")).toEqual({
      kind: "apply",
      to: "refunded",
    });
  });

  it("rejects a genuinely invalid transition", () => {
    expect(resolvePaymentTransition("created", "refunded")).toEqual({ kind: "invalid" });
  });
});

describe("refund state machine", () => {
  it("walks requested -> pending -> processed", () => {
    expect(transitionRefund("requested", "provider_accepted")).toBe("pending");
    expect(transitionRefund("pending", "provider_processed")).toBe("processed");
  });

  it("allows a retry after a synchronous rejection or provider failure", () => {
    expect(transitionRefund("requested", "provider_rejected")).toBe("failed");
    expect(canTransitionRefund("failed", "retry")).toBe(true);
    expect(transitionRefund("failed", "retry")).toBe("requested");
  });
});

describe("transfer state machine", () => {
  it("walks pending -> on_hold -> released -> settled", () => {
    expect(transitionTransfer("pending", "payment_captured")).toBe("on_hold");
    expect(transitionTransfer("on_hold", "hold_elapsed_clear")).toBe("released");
    expect(transitionTransfer("released", "settlement_confirmed")).toBe("settled");
  });

  it("a full refund before release reverses the transfer instead of releasing it", () => {
    expect(transitionTransfer("on_hold", "full_refund_before_release")).toBe("reversed");
  });

  it("a post-release or post-settlement clawback both land on partially_reversed", () => {
    expect(transitionTransfer("released", "post_release_clawback")).toBe("partially_reversed");
    expect(transitionTransfer("settled", "clawback_after_settlement")).toBe("partially_reversed");
  });

  it("rejects releasing a transfer that never left pending", () => {
    expect(canTransitionTransfer("pending", "hold_elapsed_clear")).toBe(false);
  });
});
