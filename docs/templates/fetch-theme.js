// Put the shared flatppl-theme bundle into the build's drop directory
// (vendor/flatppl-theme, gitignored). Two sources, in this order:
//
//   1. A sibling checkout — FLATPPL_THEME_DIR, else <repo-root>/../flatppl-theme
//      when it exists. The theme's source files are copied as they are, without
//      a manifest, so the verifier reports the copy as UNVERIFIED. Re-copied on
//      every build so local theme edits show up immediately.
//   2. The pinned GitHub release otherwise — the tarball of tag
//      FLATPPL_THEME_REF (default DEFAULT_REF), extracted and then checked
//      against its own manifest.json. The tag is the only pin; no manifest hash
//      is hard-coded here.
//
// FLATPPL_THEME_NO_SIBLING=1 skips step 1 entirely (both the explicit directory
// and the automatic sibling lookup), which is how the release path is exercised
// on a machine that has a sibling checkout.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { verifyThemeBundle } = require("./theme-bundle.js");

const REPOSITORY = "https://github.com/flatppl/flatppl-theme";
const DEFAULT_REF = "v0.1.8";
const DOWNLOAD_ATTEMPTS = 4;
const RETRY_DELAY_MS = 2000;

// The theme's own release contents (scripts/bundle.ts REQUIRED_FILES). A
// sibling checkout keeps these at the same paths relative to its repository
// root, so the list doubles as the copy list and as the completeness check.
const THEME_FILES = [
  "assets/android-chrome-192x192.png",
  "assets/android-chrome-512x512.png",
  "assets/apple-touch-icon.png",
  "assets/favicon-16x16.png",
  "assets/favicon-32x32.png",
  "assets/favicon.ico",
  "assets/logo-original.png",
  "assets/logo.svg",
  "assets/site.webmanifest",
  "assets/wordmark.svg",
  "components.css",
  "footer.html",
  "header.html",
  "LICENSE.md",
  "LICENSES/CC-BY-4.0.txt",
  "LICENSES/MIT.txt",
  "shell.css",
  "shell.js",
  "syntax-map.json",
  "tokens.css",
];

const repositoryRoot = path.resolve(__dirname, "../..");

function themeRef(env) {
  return env.FLATPPL_THEME_REF || DEFAULT_REF;
}

// The release asset is `tar -czf … -C dist .`, so its files sit at the top
// level of the tarball rather than under a directory.
function releaseTarballUrl(ref) {
  return `${REPOSITORY}/releases/download/${ref}/flatppl-theme-${ref}.tar.gz`;
}

// Returns the sibling checkout to copy from, or null when the release should be
// fetched instead. An explicitly requested directory that is not there is an
// error: silently downloading instead would hide the typo.
function siblingThemeDirectory(env, root = repositoryRoot) {
  if (env.FLATPPL_THEME_NO_SIBLING === "1") return null;
  const requested = env.FLATPPL_THEME_DIR;
  if (requested) {
    if (!fs.existsSync(requested)) {
      throw new Error(`FLATPPL_THEME_DIR is set to ${requested}, which does not exist`);
    }
    return path.resolve(requested);
  }
  const sibling = path.join(path.dirname(root), "flatppl-theme");
  return fs.existsSync(sibling) ? sibling : null;
}

function copySiblingTheme(themeDirectory, dropDirectory) {
  const missing = THEME_FILES.filter((file) => !fs.existsSync(path.join(themeDirectory, file)));
  if (missing.length > 0) {
    throw new Error(
      `${themeDirectory} is not a flatppl-theme checkout; missing:\n${missing.join("\n")}`,
    );
  }
  fs.rmSync(dropDirectory, { recursive: true, force: true });
  for (const file of THEME_FILES) {
    const target = path.join(dropDirectory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(themeDirectory, file), target);
  }
}

function extractTarball(tarball, target) {
  const result = spawnSync("tar", ["-xzf", tarball, "-C", target], { stdio: "pipe" });
  if (result.error) {
    throw new Error(`cannot run tar to extract the theme release: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`tar failed on the theme release:\n${result.stderr.toString().trim()}`);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function downloadTarball(url, file) {
  let lastError;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < DOWNLOAD_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error(`cannot download ${url}: ${lastError.message}`);
}

// Downloads into a staging directory next to the drop directory (same
// filesystem, so the swap is a rename) and only publishes a bundle whose
// manifest self-check passes for the pinned tag.
async function fetchRelease(ref, dropDirectory) {
  const parent = path.dirname(dropDirectory);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, ".flatppl-theme-download-"));
  try {
    const tarball = path.join(staging, "flatppl-theme.tar.gz");
    const contents = path.join(staging, "bundle");
    fs.mkdirSync(contents);
    await downloadTarball(releaseTarballUrl(ref), tarball);
    extractTarball(tarball, contents);
    const errors = verifyThemeBundle(contents, { release: ref });
    if (errors.length > 0) {
      throw new Error(
        `the flatppl-theme ${ref} release does not match its own manifest:\n${errors.join("\n")}`,
      );
    }
    fs.rmSync(dropDirectory, { recursive: true, force: true });
    fs.renameSync(contents, dropDirectory);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// True when the drop directory already holds a verified bundle for this tag, so
// a rebuild does not re-download it.
function cachedRelease(ref, dropDirectory) {
  if (!fs.existsSync(path.join(dropDirectory, "manifest.json"))) return false;
  return verifyThemeBundle(dropDirectory, { release: ref }).length === 0;
}

async function fetchTheme(dropDirectory, { env = process.env, log = console.log } = {}) {
  const target = path.resolve(dropDirectory);
  const sibling = siblingThemeDirectory(env);
  if (sibling) {
    copySiblingTheme(sibling, target);
    log(`theme: using UNVERIFIED sibling checkout at ${sibling}`);
    return { source: "sibling", directory: sibling };
  }

  const ref = themeRef(env);
  if (cachedRelease(ref, target)) {
    log(`theme: using cached flatppl-theme ${ref} (verified)`);
    return { source: "cache", ref };
  }
  await fetchRelease(ref, target);
  log(`theme: fetched flatppl-theme ${ref} from GitHub (verified)`);
  return { source: "release", ref };
}

module.exports = {
  DEFAULT_REF,
  THEME_FILES,
  copySiblingTheme,
  fetchTheme,
  releaseTarballUrl,
  siblingThemeDirectory,
  themeRef,
};

if (require.main === module) {
  const dropDirectory = process.argv[2] || path.join(repositoryRoot, "vendor/flatppl-theme");
  fetchTheme(dropDirectory).catch((error) => {
    console.error(`theme: ${error.message}`);
    console.error(
      "theme: a build needs either a flatppl-theme checkout (FLATPPL_THEME_DIR)"
        + " or network access to the pinned release (FLATPPL_THEME_REF)",
    );
    process.exit(1);
  });
}
