// Build validation for the rendered single-page document (build/index.html).
//
// Runs after KaTeX pre-rendering, so it sees the final HTML. Fails the build
// (exit 1) on any of:
//   - dangling in-page link        an href="#frag" with no matching element id
//   - duplicate element id         the same id="x" rendered more than once
//   - residual unrendered math     a "math inline/display" span KaTeX missed
//   - unstripped cross-file ref    an href still pointing at "NN-name.md[#...]"
// and warns (non-fatal) on:
//   - orphan anchor                an explicit source <a id="x"> nothing links to
//
// Usage: node check-html.js [build/index.html] [docs-source-dir]

const fs = require("fs");
const path = require("path");

const file = process.argv[2] || "build/index.html";
const sourceDir = process.argv[3] || "docs";

let html;
try {
  html = fs.readFileSync(file, "utf8");
} catch (e) {
  console.error(`check-html: cannot read ${file}: ${e.message}`);
  process.exit(1);
}

const errors = [];

// --- collect ids, flagging duplicates (#2) ---
const idCounts = new Map();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) {
  idCounts.set(m[1], (idCounts.get(m[1]) || 0) + 1);
}
const ids = new Set(idCounts.keys());
const dupes = [...idCounts].filter(([, n]) => n > 1);
if (dupes.length > 0) {
  errors.push(
    `${dupes.length} duplicate element id(s) (ambiguous link targets):\n` +
      dupes
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([id, n]) => `    #${id}  (${n}×)`)
        .join("\n"),
  );
}

// --- in-page links must resolve (original check) ---
const linkTargets = new Set();
const missing = new Map();
for (const m of html.matchAll(/href="#([^"]+)"/g)) {
  const frag = decodeURIComponent(m[1]);
  linkTargets.add(frag);
  linkTargets.add(m[1]);
  if (!ids.has(frag) && !ids.has(m[1])) {
    missing.set(frag, (missing.get(frag) || 0) + 1);
  }
}
if (missing.size > 0) {
  errors.push(
    `${missing.size} dangling in-page link target(s):\n` +
      [...missing]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([f, n]) => `    #${f}  (${n} link${n > 1 ? "s" : ""})`)
        .join("\n"),
  );
}

// --- no residual unrendered math (#1 — closes the prerender regex-drift gap) ---
const residualMath = [
  ...html.matchAll(/class="[^"]*\bmath\s+(inline|display)\b[^"]*"/g),
];
if (residualMath.length > 0) {
  errors.push(
    `${residualMath.length} unrendered math span(s) remain — KaTeX pre-render ` +
      `did not match them (check prerender-katex.js regexes against the pandoc version).`,
  );
}

// --- no unstripped cross-file refs (#5) ---
const fileRefs = new Map();
for (const m of html.matchAll(
  /href="((?:[^":]*\/)?\d\d-[a-z0-9-]+\.md(?:#[^"]*)?)"/g,
)) {
  fileRefs.set(m[1], (fileRefs.get(m[1]) || 0) + 1);
}
if (fileRefs.size > 0) {
  errors.push(
    `${fileRefs.size} unstripped cross-file link(s) (should be in-page "#..."):\n` +
      [...fileRefs]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([t, n]) => `    ${t}  (${n}×)`)
        .join("\n"),
  );
}

if (errors.length > 0) {
  console.error(`check-html: validation failed in ${file}:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

// --- orphan explicit anchors (#6 — warn only) ---
// Explicit <a id="x"> anchors authored in the source that no in-page link
// targets. Usually a typo'd link or a dead anchor; warn rather than fail.
const explicitAnchors = new Set();
try {
  for (const f of fs.readdirSync(sourceDir)) {
    if (!/^\d\d-.*\.md$/.test(f)) continue;
    const text = fs.readFileSync(path.join(sourceDir, f), "utf8");
    for (const m of text.matchAll(/<a\s+id="([^"]+)"\s*>/g)) {
      explicitAnchors.add(m[1]);
    }
  }
} catch (e) {
  console.warn(
    `check-html: could not scan source anchors in ${sourceDir}: ${e.message}`,
  );
}
const orphans = [...explicitAnchors].filter((a) => !linkTargets.has(a)).sort();
if (orphans.length > 0) {
  console.warn(
    `check-html: ${orphans.length} explicit source anchor(s) with no inbound in-page link (warning):`,
  );
  for (const a of orphans) console.warn(`    <a id="${a}">`);
}

console.log(
  `check-html: OK — ${idCounts.size} ids, all in-page links resolve, math fully rendered.`,
);
