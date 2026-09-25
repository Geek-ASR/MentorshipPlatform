import { describe, expect, it } from "vitest";
import { isListable } from "@/server/modules/profiles/domain/listing";

describe("isListable", () => {
  it("requires an approved application and at least one active credential", () => {
    expect(isListable("approved", 1, false)).toBe(true);
    expect(isListable("approved", 0, false)).toBe(false);
  });

  it("is never listable when paused, rejected, submitted or draft, regardless of credentials", () => {
    expect(isListable("paused", 5, false)).toBe(false);
    expect(isListable("rejected", 5, false)).toBe(false);
    expect(isListable("submitted", 5, false)).toBe(false);
    expect(isListable("draft", 5, false)).toBe(false);
  });

  it("is never listable while a listing.visible restriction is active (docs/10 §7.3, Phase 10)", () => {
    expect(isListable("approved", 1, true)).toBe(false);
  });
});
