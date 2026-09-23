#!/usr/bin/env node
// Builds the static build-progress dashboard published to GitHub Pages.
// Reads docs/19-mvp-roadmap.md as the single source of truth so this page
// never drifts from the phase retrospectives already written into the repo.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const roadmapPath = path.join(repoRoot, "docs/19-mvp-roadmap.md");
const outDir = path.join(repoRoot, "dist-pages");

function sh(cmd, fallback) {
  try {
    return execSync(cmd, { cwd: repoRoot }).toString().trim();
  } catch {
    return fallback;
  }
}

const commitSha =
  process.env.GITHUB_SHA?.slice(0, 7) ?? sh("git rev-parse --short HEAD", "unknown");
const repoSlug = process.env.GITHUB_REPOSITORY ?? "Geek-ASR/MentorshipPlatform";
const generatedAt = new Date().toISOString();

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Strips the markdown bold/link syntax the roadmap uses, for plain-text summaries. */
function stripMarkdown(value) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function firstSentences(text, maxLen) {
  const clean = stripMarkdown(text.replace(/\s+/g, " ")).trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLen)}…`;
}

const roadmap = readFileSync(roadmapPath, "utf8");

// Split into "## " sections, keep only ones that start with "Phase <N> —".
const sections = roadmap.split(/\n(?=## )/);
const phaseHeaderRe = /^## Phase (\d+) — (.+?)\s*\(([A-Z])\)(.*)$/;

const phases = [];
for (const section of sections) {
  const headerLine = section.split("\n", 1)[0];
  const match = headerLine.match(phaseHeaderRe);
  if (!match) continue;
  const [, numStr, title, size, headerSuffix] = match;
  const number = Number(numStr);
  const body = section.slice(headerLine.length).trim();

  // Tolerates a qualifier between the emoji and "complete", e.g. "✅ core booking complete (date)".
  const inlineStatus = headerSuffix.match(/✅[^(]*?complete \(([\d-]+)\)/);
  const statusLine = body.match(/\*\*Status:\*\*\s*(.+?)(?:\n\n|\n$|$)/s);
  const statusFromBody = statusLine?.[1].match(/✅[^(]*?complete \(([\d-]+)\)/);

  let status = "planned";
  let date = null;
  if (inlineStatus) {
    status = "complete";
    date = inlineStatus[1];
  } else if (statusFromBody) {
    status = "complete";
    date = statusFromBody[1];
  }

  let summary;
  const scopeMatch = body.match(/\*\*Scope:\*\*\s*(.+?)(?:\n\n|$)/s);
  const deliveredMatch = body.match(/\*\*Delivered:?\*\*\s*(.+?)(?:\n\n|$)/s);
  if (statusLine) {
    // Drop the leading "✅ [qualifier] complete (date)[, with ... below].” clause and summarise what follows.
    const rest = statusLine[1].replace(/^✅[^(]*?complete \([\d-]+\)(,\s*with[^.]*\.)?\.?\s*/, "");
    summary = firstSentences(rest, 240);
  } else if (deliveredMatch) {
    summary = firstSentences(deliveredMatch[1], 240);
  } else if (scopeMatch) {
    summary = firstSentences(scopeMatch[1], 240);
  } else {
    summary = firstSentences(body, 240);
  }

  phases.push({ number, title: title.trim(), size, status, date, summary });
}

phases.sort((a, b) => a.number - b.number);

const total = phases.length;
const complete = phases.filter((p) => p.status === "complete").length;
const pct = total ? Math.round((complete / total) * 100) : 0;

const sizeLabel = { S: "days", M: "1–2 weeks", L: "2–4 weeks" };

function phaseCard(p) {
  const badge =
    p.status === "complete"
      ? `<span class="badge badge-done">✓ Complete${p.date ? ` · ${escapeHtml(p.date)}` : ""}</span>`
      : `<span class="badge badge-planned">Planned</span>`;
  return `
    <li class="phase phase-${p.status}">
      <div class="phase-head">
        <span class="phase-num">${p.number}</span>
        <h3>${escapeHtml(p.title)}</h3>
        ${badge}
      </div>
      <p class="phase-size">Size: ${p.size} (${sizeLabel[p.size] ?? p.size})</p>
      <p class="phase-summary">${escapeHtml(p.summary)}</p>
    </li>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Aheadly — build progress</title>
<meta name="description" content="Live build-progress tracker for Aheadly, generated from the project roadmap on every push to main." />
<meta name="robots" content="noindex" />
<style>
  :root {
    color-scheme: light dark;
    --bg: #fbfaf8;
    --surface: #ffffff;
    --ink: #1c1a17;
    --ink-muted: #6b6357;
    --line: #e7e2da;
    --accent: #b5502f;
    --accent-ink: #ffffff;
    --done-bg: #eaf3ea;
    --done-ink: #2a6b3f;
    --planned-bg: #f1efec;
    --planned-ink: #6b6357;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #171512;
      --surface: #201d19;
      --ink: #f2ede6;
      --ink-muted: #a89f92;
      --line: #35302a;
      --done-bg: #1c2e20;
      --done-ink: #7fca92;
      --planned-bg: #2a2621;
      --planned-ink: #a89f92;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    line-height: 1.5;
  }
  main {
    max-width: 780px;
    margin: 0 auto;
    padding: 2.5rem 1.25rem 4rem;
  }
  header.top { margin-bottom: 1.75rem; }
  h1 { font-size: 1.75rem; margin: 0 0 0.25rem; }
  .tagline { color: var(--ink-muted); margin: 0; }
  .callout {
    margin-top: 1.5rem;
    padding: 0.9rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    font-size: 0.9rem;
    color: var(--ink-muted);
  }
  .callout a { color: var(--accent); }
  .progress-wrap { margin: 2rem 0 2.5rem; }
  .progress-label {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    margin-bottom: 0.4rem;
    color: var(--ink-muted);
  }
  .progress-track {
    height: 10px;
    border-radius: 999px;
    background: var(--planned-bg);
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 999px;
  }
  ul.phases { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
  li.phase {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    padding: 1rem 1.1rem;
  }
  li.phase-planned { opacity: 0.72; }
  .phase-head { display: flex; align-items: center; gap: 0.6rem; }
  .phase-num {
    flex: none;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 999px;
    background: var(--planned-bg);
    color: var(--ink-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: 600;
  }
  li.phase-complete .phase-num { background: var(--done-bg); color: var(--done-ink); }
  .phase-head h3 { margin: 0; font-size: 1rem; flex: 1; }
  .badge {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  .badge-done { background: var(--done-bg); color: var(--done-ink); }
  .badge-planned { background: var(--planned-bg); color: var(--planned-ink); }
  .phase-size { margin: 0.35rem 0 0.15rem; font-size: 0.78rem; color: var(--ink-muted); }
  .phase-summary { margin: 0.35rem 0 0; font-size: 0.88rem; }
  footer {
    margin-top: 2.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--line);
    font-size: 0.8rem;
    color: var(--ink-muted);
  }
  footer a { color: var(--accent); }
</style>
</head>
<body>
<main>
  <header class="top">
    <h1>Aheadly — build progress</h1>
    <p class="tagline">Guidance from people who've been there. This page tracks how much of the platform is built.</p>
  </header>

  <div class="callout">
    This is a static progress tracker, not the live product. Aheadly needs a server and a database
    (accounts, mentor search, bookings), so it can't run on GitHub Pages itself — it will deploy to a
    real host per <a href="https://github.com/${repoSlug}/blob/main/docs/14-deployment.md">docs/14-deployment.md</a>
    once a sandbox beta is ready. In the meantime, every phase below is built and tested against a real
    Postgres database and merged straight to <code>main</code> — see the
    <a href="https://github.com/${repoSlug}">source</a> and
    <a href="https://github.com/${repoSlug}/blob/main/docs/19-mvp-roadmap.md">full roadmap</a>.
  </div>

  <div class="progress-wrap">
    <div class="progress-label">
      <span>${complete} of ${total} build phases complete</span>
      <span>${pct}%</span>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
  </div>

  <ul class="phases">
    ${phases.map(phaseCard).join("\n")}
  </ul>

  <footer>
    Generated ${escapeHtml(generatedAt)} from commit
    <a href="https://github.com/${repoSlug}/commit/${commitSha}"><code>${commitSha}</code></a>.
    Rebuilt automatically on every push to <code>main</code>.
  </footer>
</main>
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "index.html"), html);
const nojekyll = path.join(outDir, ".nojekyll");
writeFileSync(nojekyll, "");

console.warn(`Wrote ${path.join(outDir, "index.html")} (${complete}/${total} phases complete)`);
