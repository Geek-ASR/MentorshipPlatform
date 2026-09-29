import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * docs/22 §6.1: every text colour pair in the design tokens meets WCAG 2.2 AA (4.5:1), read from
 * the real `globals.css` so a palette change can't quietly drop below it.
 */

const css = readFileSync(path.resolve(__dirname, "../../../src/app/globals.css"), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1]!, m[2]!]),
  );
}

const light = tokens(
  css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme")),
);
const dark = {
  ...light,
  ...tokens(css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf("@theme inline"))),
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

const TEXT_PAIRS: [foreground: string, background: string][] = [
  ["ink", "canvas"],
  ["ink", "surface"],
  ["ink-muted", "canvas"],
  ["ink-muted", "surface"],
  ["primary", "surface"],
  ["primary", "primary-soft"],
  ["on-primary", "primary"],
  ["on-primary", "primary-strong"],
  ["accent", "surface"],
  ["accent", "canvas"],
  ["on-accent", "accent"],
  ["accent-ink", "accent-soft"],
  ["success", "surface"],
  ["warning", "surface"],
  ["danger", "surface"],
  ["on-night", "night"],
  ["on-night", "night-2"],
  ["on-night-muted", "night"],
  ["on-night-muted", "night-2"],
  ...[1, 2, 3, 4, 5, 6].map((n) => [`tone-${n}-fg`, `tone-${n}-bg`] as [string, string]),
];

/** Status badges set coloured text on a 10% tint of the same colour (`bg-success/10 text-success`). */
function tint(hex: string, over: string, alpha = 0.1): string {
  const channel = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) => Math.round(alpha * channel(hex, i) + (1 - alpha) * channel(over, i)))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

describe("design token contrast (WCAG 2.2 AA)", () => {
  it("status text stays at least 4.5:1 on its own tint, on the page and on cards", () => {
    const failures = ["success", "warning", "danger", "primary"].flatMap((name) =>
      ["canvas", "surface"].flatMap((under) => {
        const ratio = contrast(light[name]!, tint(light[name]!, light[under]!));
        return ratio < 4.5 ? [`--${name} on its tint over --${under}: ${ratio.toFixed(2)}`] : [];
      }),
    );
    expect(failures).toEqual([]);
  });

  it.each(Object.entries({ light, dark }))("%s mode text pairs are at least 4.5:1", (_, set) => {
    const failures = TEXT_PAIRS.filter(([fg, bg]) => {
      expect(set[fg], `--${fg}`).toMatch(/^#/);
      expect(set[bg], `--${bg}`).toMatch(/^#/);
      return contrast(set[fg]!, set[bg]!) < 4.5;
    }).map(([fg, bg]) => `--${fg} on --${bg}: ${contrast(set[fg]!, set[bg]!).toFixed(2)}`);
    expect(failures).toEqual([]);
  });
});
