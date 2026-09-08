const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const EXPECTED_SOURCE = {
  repository: "https://github.com/flatppl/flatppl-theme",
  commit: "d1b4372e92d7421828f9ee38f3f103e0469beedd",
  release: "v0.1.4",
};
const EXPECTED_MANIFEST_SHA256 =
  "7ab3caefa5f8736077945dd4d6f3571fdc17c4f53004c61f6395758e3a3675cc";

function filesUnder(root, directory = root) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(root, absolute);
    if (!entry.isFile()) return [];
    return [path.relative(root, absolute).split(path.sep).join("/")];
  }).sort();
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function verifyThemeBundle(bundle) {
  const manifestFile = path.join(bundle, "manifest.json");
  if (sha256(manifestFile) !== EXPECTED_MANIFEST_SHA256) {
    return ["manifest.json: SHA-256 mismatch"];
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const errors = [];
  if (manifest.schema !== 1) errors.push("manifest: unsupported schema");
  if (manifest.name !== "flatppl-theme") errors.push("manifest: unexpected name");
  if (manifest.version !== "0.1.4") errors.push("manifest: unexpected version");
  for (const [field, expected] of Object.entries(EXPECTED_SOURCE)) {
    if (manifest.source?.[field] !== expected) errors.push(`manifest: unexpected source ${field}`);
  }

  const declared = new Map(manifest.files.map((file) => [file.path, file]));
  const actual = filesUnder(bundle).filter((file) => file !== "manifest.json");
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
  fs.cpSync(bundle, publicBundle, { recursive: true });

  const header = fs.readFileSync(path.join(bundle, "header.html"), "utf8");
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
    console.log("flatppl-theme v0.1.4: manifest and hashes verified");
    return;
  }
  if (command === "prepare" && bundle && templates && output) {
    prepareTheme(bundle, templates, output);
    return;
  }
  throw new Error("usage: theme-bundle.js check BUNDLE | prepare BUNDLE TEMPLATES OUTPUT");
}

module.exports = { prepareTheme, verifyThemeBundle };

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
