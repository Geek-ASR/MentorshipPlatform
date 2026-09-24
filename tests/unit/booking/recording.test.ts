import { describe, expect, it } from "vitest";
import { isAllowedRecordingUrl } from "@/server/modules/booking/domain/recording";

describe("isAllowedRecordingUrl (docs/09 §9)", () => {
  it("allows YouTube, Drive and Vimeo URLs", () => {
    expect(isAllowedRecordingUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isAllowedRecordingUrl("https://youtu.be/abc123")).toBe(true);
    expect(isAllowedRecordingUrl("https://drive.google.com/file/d/xyz/view")).toBe(true);
    expect(isAllowedRecordingUrl("https://vimeo.com/12345")).toBe(true);
    expect(isAllowedRecordingUrl("https://player.vimeo.com/video/12345")).toBe(true);
  });

  it("rejects a host outside the allowlist", () => {
    expect(isAllowedRecordingUrl("https://evil.example.com/recording.mp4")).toBe(false);
  });

  it("rejects non-https URLs", () => {
    expect(isAllowedRecordingUrl("http://www.youtube.com/watch?v=abc123")).toBe(false);
  });

  it("rejects embedded credentials", () => {
    expect(isAllowedRecordingUrl("https://user:pass@www.youtube.com/watch?v=abc123")).toBe(false);
  });

  it("rejects a bare IP literal host", () => {
    expect(isAllowedRecordingUrl("https://192.168.1.1/watch?v=abc123")).toBe(false);
  });

  it("rejects a punycode host (lookalike-domain defence)", () => {
    expect(isAllowedRecordingUrl("https://xn--ggle-0nda.com/watch?v=abc123")).toBe(false);
  });

  it("rejects a malformed URL rather than throwing", () => {
    expect(isAllowedRecordingUrl("not a url")).toBe(false);
  });
});
