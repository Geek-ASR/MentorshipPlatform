import { BASE_PATH } from "@/config/preview";
import { ApiError, type ApiMethod } from "./api";

/**
 * The API as seen by the static GitHub Pages preview (docs/19 Phase 15e). There is no server, so
 * reads come from JSON snapshots the preview build captured from the real route handlers
 * (`scripts/preview/snapshot.ts`), and every change is politely refused. Loaded only when
 * `NEXT_PUBLIC_PREVIEW` is set, through a dynamic import in `api.ts`.
 */

export const PREVIEW_READ_ONLY =
  "This is a preview with fictional sample data, so nothing can be saved or sent here.";

async function snapshot(file: string): Promise<unknown> {
  const response = await fetch(`${BASE_PATH}/preview-api/${file}`);
  if (!response.ok) throw new ApiError(404, { title: "Not found in the preview" });
  return response.json();
}

async function read(route: string, query: URLSearchParams): Promise<unknown> {
  const slots = /^mentors\/([^/]+)\/slots$/.exec(route);
  if (slots) {
    const file = `slots/${slots[1]}--${query.get("serviceId")}--${query.get("durationMin")}.json`;
    const all = (await snapshot(file)) as { slots: { startsAt: string; endsAt: string }[] };
    const from = new Date(query.get("from") ?? 0).getTime();
    const to = new Date(query.get("to") ?? 8.64e15).getTime();
    return {
      slots: all.slots.filter(
        (s) => new Date(s.startsAt).getTime() >= from && new Date(s.endsAt).getTime() <= to,
      ),
    };
  }
  if (route === "me/bookings" && query.get("role") === "mentor") {
    return snapshot("me/bookings--mentor.json");
  }
  return snapshot(`${route}.json`);
}

/** Mirrors `previewGroupSeatPricing` with the commission rate captured at build time. */
async function pricing(body: unknown): Promise<unknown> {
  const input = body as { targetTotalMinor: number; capacity: number; minParticipants: number };
  const { commissionBps } = (await snapshot("pricing.json")) as { commissionBps: number };
  const seatPriceMinor = Math.ceil(input.targetTotalMinor / input.capacity);
  const commissionMinor = Math.round((seatPriceMinor * commissionBps) / 10_000);
  const mentorShareMinor = seatPriceMinor - commissionMinor;
  return {
    seatPriceMinor,
    commissionMinor,
    mentorShareMinor,
    earningsAtMinParticipantsMinor: mentorShareMinor * input.minParticipants,
    earningsAtCapacityMinor: mentorShareMinor * input.capacity,
  };
}

export async function previewRequest(
  path: string,
  method: ApiMethod,
  body: unknown,
): Promise<unknown> {
  const url = new URL(path, "http://preview.invalid");
  const route = url.pathname.replace(/^\/api\/v1\//, "");
  if (method === "GET") return read(route, url.searchParams);
  if (route === "me/mentor/group-sessions/preview-pricing") return pricing(body);
  if (route === "auth/sign-out") return undefined;
  throw new ApiError(403, {
    code: "PREVIEW_READ_ONLY",
    title: "Preview only",
    detail: PREVIEW_READ_ONLY,
  });
}
