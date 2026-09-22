import { describe, expect, it } from "vitest";
import { slugify } from "@/server/modules/profiles/domain/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Priya Sharma")).toBe("priya-sharma");
  });

  it("strips diacritics", () => {
    expect(slugify("Renée Müller")).toBe("renee-muller");
  });

  it("drops apostrophes without leaving a hyphen", () => {
    expect(slugify("O'Brien")).toBe("obrien");
  });

  it("collapses non-alphanumeric runs and trims edge hyphens", () => {
    expect(slugify("  Dr. Meera K.!! ")).toBe("dr-meera-k");
  });
});
