import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildInventory, INVENTORY_PATH } from "../../scripts/authz/generate-route-inventory";

/**
 * docs/13 §5's CI gate: "a new route without matrix entries fails the build." This regenerates the
 * route inventory fresh from every `route.ts` file and diffs it against the committed snapshot — a
 * route added, removed, renamed, or whose `defineRoute` metadata changed can't land silently; the
 * failure message below tells the author exactly what to do about it.
 */
describe("route inventory (docs/13 §5)", () => {
  it("matches the committed snapshot — run `npm run authz:generate-inventory` if this fails", () => {
    const fresh = buildInventory();
    const committed = JSON.parse(readFileSync(INVENTORY_PATH, "utf8")) as unknown;
    expect(fresh).toEqual(committed);
  });

  it("every route has a name and every non-machine route resolves an actor", () => {
    const fresh = buildInventory();
    expect(fresh.length).toBeGreaterThan(0);
    for (const entry of fresh) {
      expect(
        entry.name,
        `${entry.method} ${entry.path} (${entry.file}) has no defineRoute name`,
      ).toBeTruthy();
    }
  });
});
