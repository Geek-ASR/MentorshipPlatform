import { describe, expect, it } from "vitest";
import { slugify } from "@/server/modules/content/domain/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Studying in Munich: A Complete Guide")).toBe("studying-in-munich-a-complete-guide");
  });

  it("strips diacritics", () => {
    expect(slugify("Münchner Universitäten")).toBe("munchner-universitaten");
  });

  it("drops apostrophes without leaving a hyphen", () => {
    expect(slugify("What's the APS certificate?")).toBe("whats-the-aps-certificate");
  });

  it("collapses non-alphanumeric runs and trims edge hyphens", () => {
    expect(slugify("  Cost of living -- Munich!! ")).toBe("cost-of-living-munich");
  });
});
