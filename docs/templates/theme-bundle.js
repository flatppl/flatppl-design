const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Splits a bundle into the regular files to check and everything else. A
// symlink is "everything else" on purpose: it has no content to hash, so
// ignoring it would let a bundle smuggle in a path that the later recursive
// copy resolves against the build machine rather than the bundle.
function walkBundle(root, directory = root) {
  const files = [];
  const irregular = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isDirectory()) {
      const nested = walkBundle(root, absolute);
      files.push(...nested.files);
      irregular.push(...nested.irregular);
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      irregular.push(relative);
    }
  }
  return { files: files.sort(), irregular: irregular.sort() };
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

// The bundle carries its own manifest.json, so the check is self-contained: no
// hash of the manifest is pinned here. The pin is the release tag, applied by
// fetch-theme.js, which passes it as `release`.
function readManifest(bundle) {
  const manifestFile = path.join(bundle, "manifest.json");
  if (!fs.existsSync(manifestFile)) return null;
  return JSON.parse(fs.readFileSync(manifestFile, "utf8"));
}

// Returns the list of problems; an empty list means the bundle is consistent
// with its manifest — or that there is no manifest, which is how a sibling
// checkout copied in by fetch-theme.js looks. That copy cannot be verified, so
// say so loudly instead of pretending the build used a release.
function verifyThemeBundle(bundle, { release } = {}) {
  if (!fs.existsSync(bundle)) {
    return [`${bundle}: no theme bundle; run \`pixi run _fetch-theme\``];
  }
  const manifest = readManifest(bundle);
  if (manifest === null) {
    console.warn(`theme: ${bundle} has no manifest.json — UNVERIFIED sibling checkout`);
    return [];
  }

  const errors = [];
  if (manifest.schema !== 1) errors.push("manifest: unsupported schema");
  if (manifest.name !== "flatppl-theme") errors.push("manifest: unexpected name");
  if (release !== undefined && manifest.source?.release !== release) {
    errors.push(`manifest: expected release ${release}, found ${manifest.source?.release}`);
  }

  const declared = new Map(manifest.files.map((file) => [file.path, file]));
  const { files, irregular } = walkBundle(bundle);
  for (const file of irregular) errors.push(`${file}: not a regular file`);
  const actual = files.filter((file) => file !== "manifest.json");
  for (const file of actual) {
    if (!declared.has(file)) errors.push(`${file}: not declared in manifest`);
  }
  for (const [relative, expected] of declared) {
    if (!actual.includes(relative)) {
      errors.push(`${relative}: missing`);
      continue;
    }
    const file = path.join(bundle, relative);
    if (fs.statSync(file).size !== expected.size) errors.push(`${relative}: size mismatch`);
    if (sha256(file) !== expected.sha256) errors.push(`${relative}: SHA-256 mismatch`);
  }
  return errors;
}

function injectFragment(template, marker, fragment) {
  const occurrences = template.split(marker).length - 1;
  if (occurrences !== 1) throw new Error(`${marker}: expected once, found ${occurrences}`);
  return template.replace(marker, fragment.trim());
}

function syntaxCss(syntaxMap) {
  const rules = syntaxMap.groups.flatMap((group) =>
    group.pandocClasses.map(
      (className) => `code span.${className} { color: var(${group.cssVariable}); }`,
    ),
  );
  return [
    "/* Generated from vendor/flatppl-theme/syntax-map.json. */",
    ...rules,
    "",
  ].join("\n");
}

function prepareTheme(bundle, templates, output) {
  const errors = verifyThemeBundle(bundle);
  if (errors.length > 0) throw new Error(`theme bundle verification failed:\n${errors.join("\n")}`);

  const publicBundle = path.join(output, "flatppl-theme");
  fs.rmSync(publicBundle, { recursive: true, force: true });
  // Verification rejects anything but regular files and directories; copying
  // without dereferencing keeps that true even for an unverified sibling copy.
  fs.cpSync(bundle, publicBundle, { recursive: true, dereference: false });

  const header = fs.readFileSync(path.join(bundle, "header.html"), "utf8")
    .replace('href="https://github.com/flatppl"', 'href="https://github.com/flatppl/flatppl-design"');
  const footer = fs.readFileSync(path.join(bundle, "footer.html"), "utf8");
  for (const filename of ["template.html", "page.html"]) {
    let template = fs.readFileSync(path.join(templates, filename), "utf8");
    template = injectFragment(template, "<!-- flatppl-theme:header -->", header);
    template = injectFragment(template, "<!-- flatppl-theme:footer -->", footer);
    fs.writeFileSync(path.join(output, filename), template);
  }
  fs.copyFileSync(path.join(templates, "head.html"), path.join(output, "head.html"));

  const syntaxMap = JSON.parse(fs.readFileSync(path.join(bundle, "syntax-map.json"), "utf8"));
  fs.writeFileSync(path.join(output, "flatppl-syntax.css"), syntaxCss(syntaxMap));
}

function main(args) {
  const [command, bundle, templates, output] = args;
  if (command === "check" && bundle) {
    const errors = verifyThemeBundle(bundle);
    if (errors.length > 0) throw new Error(errors.join("\n"));
    const manifest = readManifest(bundle);
    if (manifest) console.log(`flatppl-theme v${manifest.version}: manifest and hashes verified`);
    return;
  }
  if (command === "prepare" && bundle && templates && output) {
    prepareTheme(bundle, templates, output);
    return;
  }
  throw new Error("usage: theme-bundle.js check BUNDLE | prepare BUNDLE TEMPLATES OUTPUT");
}

module.exports = { prepareTheme, readManifest, verifyThemeBundle };

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
