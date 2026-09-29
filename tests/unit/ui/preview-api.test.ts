import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/ui/api";
import { previewRequest } from "@/ui/preview-api";

function serve(files: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) =>
    url in files
      ? new Response(JSON.stringify(files[url]), { status: 200 })
      : new Response("missing", { status: 404 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("previewRequest (static GitHub Pages preview)", () => {
  it("serves a slot snapshot filtered to the window the picker asks for", async () => {
    serve({
      "/preview-api/slots/sneha--svc--45.json": {
        slots: [
          { startsAt: "2026-10-01T04:00:00.000Z", endsAt: "2026-10-01T04:45:00.000Z" },
          { startsAt: "2026-10-03T04:00:00.000Z", endsAt: "2026-10-03T04:45:00.000Z" },
        ],
      },
    });
    const query = new URLSearchParams({
      serviceId: "svc",
      durationMin: "45",
      from: "2026-10-02T00:00:00.000Z",
      to: "2026-10-04T00:00:00.000Z",
    });
    await expect(
      previewRequest(`/api/v1/mentors/sneha/slots?${query}`, "GET", undefined),
    ).resolves.toEqual({
      slots: [{ startsAt: "2026-10-03T04:00:00.000Z", endsAt: "2026-10-03T04:45:00.000Z" }],
    });
  });

  it("maps other reads to their snapshot files, including the mentor's own bookings", async () => {
    const fetchMock = serve({
      "/preview-api/me/bookings--mentor.json": { bookings: [] },
      "/preview-api/sessions/abc/seats.json": { capacity: 6, liveSeats: 2 },
    });
    await previewRequest("/api/v1/me/bookings?role=mentor", "GET", undefined);
    await previewRequest("/api/v1/sessions/abc/seats", "GET", undefined);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/preview-api/me/bookings--mentor.json",
      "/preview-api/sessions/abc/seats.json",
    ]);
    await expect(previewRequest("/api/v1/me/unknown", "GET", undefined)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("computes the group price preview with the captured platform fee", async () => {
    serve({ "/preview-api/pricing.json": { commissionBps: 1000 } });
    await expect(
      previewRequest("/api/v1/me/mentor/group-sessions/preview-pricing", "POST", {
        targetTotalMinor: 300_000,
        capacity: 6,
        minParticipants: 2,
      }),
    ).resolves.toEqual({
      seatPriceMinor: 50_000,
      commissionMinor: 5_000,
      mentorShareMinor: 45_000,
      earningsAtMinParticipantsMinor: 90_000,
      earningsAtCapacityMinor: 270_000,
    });
  });

  it("refuses every change with a plain explanation, but lets sign-out through", async () => {
    serve({});
    const refusal = previewRequest("/api/v1/bookings", "POST", { serviceId: "x" });
    await expect(refusal).rejects.toBeInstanceOf(ApiError);
    await expect(refusal).rejects.toMatchObject({ status: 403, code: "PREVIEW_READ_ONLY" });
    await expect(previewRequest("/api/v1/auth/sign-out", "POST", undefined)).resolves.toBe(
      undefined,
    );
  });
});
