import { describe, expect, it } from "vitest";
import { normalizeMfaCode } from "@/ui/mfa-code";

describe("normalizeMfaCode", () => {
  it("keeps six-digit authenticator codes, minus stray spaces", () => {
    expect(normalizeMfaCode("123456")).toBe("123456");
    expect(normalizeMfaCode(" 123 456 ")).toBe("123456");
  });

  it("restores the issued ABCD-EFGH shape for recovery codes typed loosely", () => {
    expect(normalizeMfaCode("ABCD-EFGH")).toBe("ABCD-EFGH");
    expect(normalizeMfaCode("abcd-efgh")).toBe("ABCD-EFGH");
    expect(normalizeMfaCode("abcdefgh")).toBe("ABCD-EFGH");
    expect(normalizeMfaCode("abcd efgh")).toBe("ABCD-EFGH");
    expect(normalizeMfaCode("AB2C-7DEF")).toBe("AB2C-7DEF");
  });

  it("passes anything else through trimmed, for the server to reject", () => {
    expect(normalizeMfaCode(" 12345 ")).toBe("12345");
    expect(normalizeMfaCode("not-a-code-at-all")).toBe("not-a-code-at-all");
  });
});
