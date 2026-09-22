import { describe, expect, it } from "vitest";
import { isListable } from "@/server/modules/profiles/domain/listing";

describe("isListable", () => {
  it("requires an approved application and at least one active credential", () => {
    expect(isListable("approved", 1)).toBe(true);
    expect(isListable("approved", 0)).toBe(false);
  });

  it("is never listable when paused, rejected, submitted or draft, regardless of credentials", () => {
    expect(isListable("paused", 5)).toBe(false);
    expect(isListable("rejected", 5)).toBe(false);
    expect(isListable("submitted", 5)).toBe(false);
    expect(isListable("draft", 5)).toBe(false);
  });
});
