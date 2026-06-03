#!/usr/bin/env node
"use strict";
// Post-processes a pandoc output file in place.
//
// Replaces the former chained `sed -i` fixups (and the sed / m2-sed build
// dependency) with one documented, cross-platform pass. Output is intended to
// be byte-identical to the previous sed pipeline — see the build-output hash
// check in CI / the round-trip test.
//
// Usage: node postprocess-pandoc.js <md|typst> <file>

const fs = require("fs");

const mode = process.argv[2];
const file = process.argv[3];
if (!mode || !file) {
  console.error("usage: postprocess-pandoc.js <md|typst> <file>");
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

if (mode === "md") {
  // Strip the space pandoc emits after an info-string-less opening fence
  // ("``` " -> "```") at the start of a line. (Was: sed 's/^``` /```/g'.)
  s = s.replace(/^``` /gm, "```");
} else if (mode === "typst") {
  // Pandoc's typst writer emits symbol spellings that differ from the
  // installed typst's; map them. (Was: three sed passes, applied in order.)
  s = s.replace(/times\.circle/g, "times.o"); // ⊗  (was: s/times\.circle/times.o/g)
  s = s.replace(/\bsect\b/g, "inter"); //          ∩  (was: s/\bsect\b/inter/g)
  // Drop stray empty reference-div markers. Line-based to match `sed '/^<references>$/d'`
  // exactly, regardless of a trailing newline on the final line.
  s = s
    .split("\n")
    .filter((line) => line !== "<references>")
    .join("\n");
} else {
  console.error("postprocess-pandoc: unknown mode '" + mode + "' (expected md|typst)");
  process.exit(1);
}

fs.writeFileSync(file, s);
