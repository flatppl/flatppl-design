// Build step: compile the Typst document to PDF and escalate label
// diagnostics to build failures.
//
// `typst compile` exits 0 even when it emits "label ... is not attached to
// anything" warnings — but an unattached label is dropped, so any
// cross-reference to it later fails (or, worse for HTML-only links, ships
// silently). This wrapper runs the compile, forwards all output, and exits
// non-zero if Typst reported any unattached or missing labels.

const { spawnSync } = require("child_process");

const input = process.argv[2] || "build/flatppl-design.typ";
const output = process.argv[3] || "build/flatppl-design.pdf";

const r = spawnSync("typst", ["compile", input, output], { encoding: "utf8" });

if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);

if (r.error) {
  console.error(`check-typst: failed to run typst: ${r.error.message}`);
  process.exit(1);
}
if (r.status !== 0) process.exit(r.status);

const label_problem =
  /label `[^`]+` is not attached to anything|label `[^`]+` does not exist/;
if (label_problem.test(r.stderr || "")) {
  console.error(
    "\ncheck-typst: Typst label warnings escalated to errors (see above). " +
      "Place anchors so they attach (the html-anchors filter normalizes leading " +
      "anchors automatically) and ensure every cross-referenced label exists.",
  );
  process.exit(1);
}

console.log("check-typst: OK — PDF compiled with no label problems.");
