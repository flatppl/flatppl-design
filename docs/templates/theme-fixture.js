// Test support for the theme scripts: builds flatppl-theme bundles and
// checkouts in a temporary directory. The theme is fetched at build time and no
// longer committed, so the tests must not read vendor/flatppl-theme — a test
// run happens before, or without, a fetch.

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Enough of a bundle for prepareTheme: the two shell fragments, the syntax map
// and a stylesheet, plus a file in a subdirectory to exercise nested paths.
const SAMPLE_FILES = {
  "header.html":
    '<header class="site-header"><a href="https://github.com/flatppl">GitHub</a></header>\n',
  "footer.html": '<footer class="site-footer">FlatPPL</footer>\n',
  "syntax-map.json": `${JSON.stringify(
    {
      groups: [
        { cssVariable: "--syntax-keyword", pandocClasses: ["kw", "cf"] },
        { cssVariable: "--syntax-number", pandocClasses: ["dv"] },
      ],
    },
    null,
    2,
  )}\n`,
  "tokens.css": ":root { --ink: #101010; }\n",
  "assets/logo.svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>\n',
};

function temporaryDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFiles(directory, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(directory, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
}

// The same shape the theme's own release build writes, computed from the files
// actually on disk, so a fixture bundle is self-consistent by construction.
function writeManifest(directory, {
  name = "flatppl-theme",
  version = "0.1.8",
  release = "v0.1.8",
  files = undefined,
} = {}) {
  const paths = files ?? Object.keys(SAMPLE_FILES);
  const manifest = {
    schema: 1,
    name,
    version,
    source: {
      repository: "https://github.com/flatppl/flatppl-theme",
      commit: "0".repeat(40),
      release,
    },
    files: paths.sort().map((relative) => {
      const contents = fs.readFileSync(path.join(directory, relative));
      return {
        path: relative,
        sha256: crypto.createHash("sha256").update(contents).digest("hex"),
        size: contents.length,
      };
    }),
  };
  fs.writeFileSync(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// `manifest: false` builds the shape a sibling checkout is copied in as: the
// theme files without a manifest, which the verifier reports as unverified.
function writeBundle(directory, { files = SAMPLE_FILES, manifest = true, ...options } = {}) {
  fs.mkdirSync(directory, { recursive: true });
  writeFiles(directory, files);
  if (!manifest) return null;
  return writeManifest(directory, { ...options, files: Object.keys(files) });
}

module.exports = { SAMPLE_FILES, temporaryDirectory, writeBundle, writeFiles, writeManifest };
