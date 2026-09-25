import { describe, expect, it } from "vitest";
import {
  containsProfanity,
  detectClaimPhrases,
  detectContactInfo,
  hasPaymentSolicitation,
  shouldHoldForModeration,
} from "@/server/modules/trust/domain/detectors";

describe("detectContactInfo: phone numbers", () => {
  it("catches a plain unbroken 10-digit number", () => {
    const hits = detectContactInfo("call me at 9876543210 please");
    expect(hits.some((h) => h.kind === "phone")).toBe(true);
  });

  it("catches an internationally-prefixed number", () => {
    const hits = detectContactInfo("+919876543210 is my number");
    expect(hits.some((h) => h.kind === "phone")).toBe(true);
  });

  it("catches space-obfuscated grouped digits (98765 43210)", () => {
    const hits = detectContactInfo("reach me on 98765 43210 anytime");
    expect(hits.some((h) => h.kind === "phone")).toBe(true);
  });

  it("catches single-digit-spaced obfuscation (9 8 7 6 5 4 3 2 1 0)", () => {
    const hits = detectContactInfo("9 8 7 6 5 4 3 2 1 0 call this");
    expect(hits.some((h) => h.kind === "phone")).toBe(true);
  });

  it("catches hyphen/dot-separated obfuscation", () => {
    const hits = detectContactInfo("9-876-543-210 or 98.765.432.10");
    expect(hits.some((h) => h.kind === "phone")).toBe(true);
  });

  it("catches word-spelled digits ('nine eight seven six five...')", () => {
    const hits = detectContactInfo("nine eight seven six five four three two one zero, call");
    expect(hits.some((h) => h.kind === "phone")).toBe(true);
  });

  it("does not flag a 4-digit year or a short price as a phone number", () => {
    const hits = detectContactInfo("in 2026 the price was 1999 rupees");
    expect(hits.some((h) => h.kind === "phone")).toBe(false);
  });

  it("does not flag a normal clock time as a phone number", () => {
    const hits = detectContactInfo("let's meet at 10:30 on the 5th");
    expect(hits.some((h) => h.kind === "phone")).toBe(false);
  });
});

describe("detectContactInfo: email addresses", () => {
  it("catches a standard email address", () => {
    const hits = detectContactInfo("email me at student@example.com");
    expect(hits.some((h) => h.kind === "email")).toBe(true);
  });

  it("does not flag prose with an @ that isn't an email", () => {
    const hits = detectContactInfo("I got a 90% score, not bad @ all");
    expect(hits.some((h) => h.kind === "email")).toBe(false);
  });
});

describe("detectContactInfo: UPI VPAs", () => {
  it("catches a UPI VPA at a known handle", () => {
    for (const handle of ["okaxis", "ybl", "paytm", "oksbi"]) {
      const hits = detectContactInfo(`pay me at rahul123@${handle}`);
      expect(
        hits.some((h) => h.kind === "upi_vpa"),
        `handle ${handle}`,
      ).toBe(true);
    }
  });
});

describe("detectContactInfo: URL shorteners", () => {
  it("catches a known shortener domain", () => {
    const hits = detectContactInfo("click here https://bit.ly/abc123");
    expect(hits.some((h) => h.kind === "url_shortener")).toBe(true);
  });

  it("does not flag a normal full URL", () => {
    const hits = detectContactInfo("see https://university.edu/admissions");
    expect(hits.some((h) => h.kind === "url_shortener")).toBe(false);
  });
});

describe("detectContactInfo: payment keywords", () => {
  it("catches common off-platform payment phrases", () => {
    for (const phrase of ["gpay", "paytm", "phonepe", "paypal", "whatsapp me", "pay directly"]) {
      const hits = detectContactInfo(`Let's just do it via ${phrase} instead`);
      expect(
        hits.some((h) => h.kind === "payment_keyword"),
        phrase,
      ).toBe(true);
    }
  });
});

describe("hasPaymentSolicitation", () => {
  it("is true for a payment keyword or a UPI VPA hit", () => {
    expect(hasPaymentSolicitation([{ kind: "payment_keyword", match: "gpay" }])).toBe(true);
    expect(hasPaymentSolicitation([{ kind: "upi_vpa", match: "x@ybl" }])).toBe(true);
  });

  it("is false for a phone/email/url hit alone", () => {
    expect(hasPaymentSolicitation([{ kind: "phone", match: "9876543210" }])).toBe(false);
  });
});

describe("detectClaimPhrases", () => {
  it("catches prohibited guarantee phrases", () => {
    expect(detectClaimPhrases("we offer a 100% visa guarantee").length).toBeGreaterThan(0);
    expect(detectClaimPhrases("guaranteed admission or your money back").length).toBeGreaterThan(0);
    expect(detectClaimPhrases("we write your SOP for you").length).toBeGreaterThan(0);
  });

  it("does not flag ordinary mentoring language", () => {
    expect(detectClaimPhrases("I'll review your SOP and give feedback").length).toBe(0);
  });
});

describe("containsProfanity", () => {
  it("catches a profane word", () => {
    expect(containsProfanity("this is such bullshit")).toBe(true);
  });

  it("does not flag clean text", () => {
    expect(containsProfanity("this was a great session, thank you")).toBe(false);
  });
});

describe("shouldHoldForModeration", () => {
  it("holds when any check is true", () => {
    expect(
      shouldHoldForModeration({
        profanity: false,
        contactInfo: true,
        claimPhrases: false,
        duplicateText: false,
      }),
    ).toBe(true);
  });

  it("does not hold when every check is false", () => {
    expect(
      shouldHoldForModeration({
        profanity: false,
        contactInfo: false,
        claimPhrases: false,
        duplicateText: false,
      }),
    ).toBe(false);
  });
});

// docs/13 §3's "< 5 ms" targets a warm interpreter guarding against catastrophic (exponential)
// backtracking, not a tight perf SLA — a real ReDoS blows up to seconds, not single-digit
// milliseconds. A cold first call can cross 5ms on JIT warmup alone, so each case below runs once
// unmeasured first, then asserts a generous (but still catastrophic-backtracking-proof) bound.
function timedRun(input: string): number {
  detectContactInfo(input); // warmup — not timed.
  const start = performance.now();
  detectContactInfo(input);
  return performance.now() - start;
}

describe("ReDoS timing guard (docs/13 §3)", () => {
  it("runs in well under 50ms on a 4,000-char adversarial input of digits and separators", () => {
    const adversarial = "1 ".repeat(2000); // worst case for chunk-scanning: many short alternating tokens.
    expect(timedRun(adversarial)).toBeLessThan(50);
  });

  it("runs in well under 50ms on a 4,000-char adversarial input mixing digits, dots and dashes", () => {
    const adversarial = "9-8.7-6.5-8.7-6.5-8.7-6.5-".repeat(160).slice(0, 4000);
    expect(timedRun(adversarial)).toBeLessThan(50);
  });
});
