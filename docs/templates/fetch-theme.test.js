const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const {
  DEFAULT_REF,
  SETUP_HINT,
  THEME_FILES,
  fetchTheme,
  releaseTarballUrl,
  siblingThemeDirectory,
  themeRef,
} = require("./fetch-theme.js");
const { readManifest, verifyThemeBundle } = require("./theme-bundle.js");
const {
  SAMPLE_FILES,
  temporaryDirectory,
  writeBundle,
  writeFiles,
} = require("./theme-fixture.js");

const checkoutFiles = Object.fromEntries(THEME_FILES.map((file) => [file, `${file}\n`]));

// Stands in for the download: packs a fixture bundle the way the theme's
// release job does (`tar -czf … -C dist .`, files at the top level), so the
// extract, self-check and swap run for real without a network round trip.
function tarballFrom(bundle, calls = []) {
  return (url, file) => {
    calls.push(url);
    const result = spawnSync("tar", ["-czf", file, "-C", bundle, "."]);
    assert.equal(result.status, 0, result.stderr?.toString());
  };
}

function releaseFixture(context, { release, version, skip = [] }) {
  const bundle = temporaryDirectory("flatppl-theme-release-");
  context.after(() => fs.rmSync(bundle, { recursive: true, force: true }));
  const files = Object.fromEntries(
    Object.entries(checkoutFiles).filter(([file]) => !skip.includes(file)),
  );
  writeBundle(bundle, { files, release, version });
  return bundle;
}

// A checkout of the theme repository, as far as the copy step cares: every
// required file at its path relative to the repository root.
function checkoutFixture(context, { skip = [] } = {}) {
  const checkout = temporaryDirectory("flatppl-theme-checkout-");
  context.after(() => fs.rmSync(checkout, { recursive: true, force: true }));
  const files = Object.fromEntries(
    Object.entries(checkoutFiles).filter(([file]) => !skip.includes(file)),
  );
  writeFiles(checkout, files);
  return checkout;
}

function dropDirectory(context) {
  const workspace = temporaryDirectory("flatppl-theme-drop-");
  context.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  return path.join(workspace, "vendor/flatppl-theme");
}

test("the release URL is the pinned tag's tarball asset", () => {
  assert.equal(
    releaseTarballUrl("v0.1.8"),
    "https://github.com/flatppl/flatppl-theme/releases/download/v0.1.8/flatppl-theme-v0.1.8.tar.gz",
  );
  assert.equal(
    releaseTarballUrl(DEFAULT_REF),
    `https://github.com/flatppl/flatppl-theme/releases/download/${DEFAULT_REF}/flatppl-theme-${DEFAULT_REF}.tar.gz`,
  );
});

test("the tag is the pin, overridable for a candidate release", () => {
  assert.equal(themeRef({}), DEFAULT_REF);
  assert.equal(themeRef({ FLATPPL_THEME_REF: "v0.2.0-rc1" }), "v0.2.0-rc1");
});

test("the sibling checkout is resolved from the environment or next to the repository", (context) => {
  const workspace = temporaryDirectory("flatppl-theme-siblings-");
  context.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const root = path.join(workspace, "flatppl-design");
  const sibling = path.join(workspace, "flatppl-theme");
  fs.mkdirSync(root);

  assert.equal(siblingThemeDirectory({}, root), null);
  fs.mkdirSync(sibling);
  assert.equal(siblingThemeDirectory({}, root), sibling);

  const requested = path.join(workspace, "elsewhere");
  fs.mkdirSync(requested);
  assert.equal(siblingThemeDirectory({ FLATPPL_THEME_DIR: requested }, root), requested);

  // Both lookups are off, which is how the release path is exercised on a
  // machine that has a sibling checkout.
  assert.equal(siblingThemeDirectory({ FLATPPL_THEME_NO_SIBLING: "1" }, root), null);
  assert.equal(
    siblingThemeDirectory({ FLATPPL_THEME_DIR: requested, FLATPPL_THEME_NO_SIBLING: "1" }, root),
    null,
  );

  assert.throws(
    () => siblingThemeDirectory({ FLATPPL_THEME_DIR: path.join(workspace, "absent") }, root),
    /does not exist/,
  );
});

test("a sibling checkout is copied in unverified", async (context) => {
  const checkout = checkoutFixture(context);
  const drop = dropDirectory(context);
  const lines = [];
  const warnings = [];
  context.mock.method(console, "warn", (message) => warnings.push(message));

  const result = await fetchTheme(drop, {
    env: { FLATPPL_THEME_DIR: checkout },
    log: (line) => lines.push(line),
  });

  assert.deepEqual(result, { source: "sibling", directory: checkout });
  assert.deepEqual(lines, [`theme: using UNVERIFIED sibling checkout at ${checkout}`]);
  for (const file of THEME_FILES) {
    assert.equal(fs.readFileSync(path.join(drop, file), "utf8"), `${file}\n`);
  }
  // No manifest: the copy is whatever the checkout currently holds, and the
  // verifier reports it as unverified rather than failing the build.
  assert.equal(fs.existsSync(path.join(drop, "manifest.json")), false);
  assert.deepEqual(verifyThemeBundle(drop), []);
  assert.equal(warnings.length, 1);
});

test("each build re-copies the sibling checkout", async (context) => {
  const checkout = checkoutFixture(context);
  const drop = dropDirectory(context);
  const log = () => {};
  await fetchTheme(drop, { env: { FLATPPL_THEME_DIR: checkout }, log });

  fs.writeFileSync(path.join(drop, "tokens.css"), "stale\n");
  fs.writeFileSync(path.join(drop, "gone.css"), "left over\n");
  fs.writeFileSync(path.join(checkout, "tokens.css"), "edited\n");
  await fetchTheme(drop, { env: { FLATPPL_THEME_DIR: checkout }, log });

  assert.equal(fs.readFileSync(path.join(drop, "tokens.css"), "utf8"), "edited\n");
  assert.equal(fs.existsSync(path.join(drop, "gone.css")), false);
});

test("an incomplete checkout names the files it is missing", async (context) => {
  const checkout = checkoutFixture(context, { skip: ["shell.js", "assets/logo.svg"] });
  const drop = dropDirectory(context);
  await assert.rejects(
    fetchTheme(drop, { env: { FLATPPL_THEME_DIR: checkout }, log: () => {} }),
    (error) => {
      assert.match(error.message, /not a flatppl-theme checkout[\s\S]*assets\/logo\.svg[\s\S]*shell\.js/);
      // The way out travels with the error, not only with the CLI's output.
      assert.ok(error.message.includes(SETUP_HINT));
      return true;
    },
  );
});

test("assets are copied recursively, not file by file", async (context) => {
  const checkout = checkoutFixture(context);
  writeFiles(checkout, {
    "assets/added-upstream.svg": "<svg/>\n",
    "assets/nested/deep.svg": "<svg/>\n",
  });
  const drop = dropDirectory(context);

  await fetchTheme(drop, { env: { FLATPPL_THEME_DIR: checkout }, log: () => {} });

  assert.ok(fs.existsSync(path.join(drop, "assets/added-upstream.svg")));
  assert.ok(fs.existsSync(path.join(drop, "assets/nested/deep.svg")));
});

test("a verified bundle for the pinned tag is reused instead of re-downloaded", async (context) => {
  const drop = dropDirectory(context);
  writeBundle(drop, { release: "v9.9.9", version: "9.9.9" });
  const lines = [];

  const result = await fetchTheme(drop, {
    env: { FLATPPL_THEME_NO_SIBLING: "1", FLATPPL_THEME_REF: "v9.9.9" },
    log: (line) => lines.push(line),
  });

  assert.deepEqual(result, { source: "cache", ref: "v9.9.9" });
  assert.deepEqual(lines, ["theme: using cached flatppl-theme v9.9.9 (verified)"]);
});

test("a cached bundle for another tag is replaced by the pinned release", async (context) => {
  const drop = dropDirectory(context);
  // Consistent with its own manifest, so the tag is the only thing that makes
  // this bundle stale.
  writeBundle(drop, {
    files: { ...SAMPLE_FILES, "stale-marker": "from the previous pin\n" },
    release: "v9.9.9",
    version: "9.9.9",
  });
  assert.deepEqual(verifyThemeBundle(drop, { release: "v9.9.9" }), []);
  const release = releaseFixture(context, { release: "v1.2.3", version: "1.2.3" });
  const requested = [];
  const lines = [];

  const result = await fetchTheme(drop, {
    env: { FLATPPL_THEME_NO_SIBLING: "1", FLATPPL_THEME_REF: "v1.2.3" },
    log: (line) => lines.push(line),
    download: tarballFrom(release, requested),
  });

  assert.deepEqual(result, { source: "release", ref: "v1.2.3" });
  assert.deepEqual(lines, ["theme: fetched flatppl-theme v1.2.3 from GitHub (verified)"]);
  assert.deepEqual(requested, [releaseTarballUrl("v1.2.3")]);
  assert.equal(readManifest(drop).source.release, "v1.2.3");
  assert.equal(fs.existsSync(path.join(drop, "stale-marker")), false);
  assert.deepEqual(verifyThemeBundle(drop, { release: "v1.2.3" }), []);
});

test("a release that stops declaring a file this build reads is an error", async (context) => {
  const drop = dropDirectory(context);
  const release = releaseFixture(context, {
    release: "v1.2.3",
    version: "1.2.3",
    skip: ["shell.js"],
  });

  await assert.rejects(
    fetchTheme(drop, {
      env: { FLATPPL_THEME_NO_SIBLING: "1", FLATPPL_THEME_REF: "v1.2.3" },
      log: () => {},
      download: tarballFrom(release),
    }),
    /does not declare files this build reads[\s\S]*shell\.js/,
  );
  // Nothing half-extracted is left where the build would pick it up.
  assert.equal(fs.existsSync(drop), false);
  assert.deepEqual(fs.readdirSync(path.dirname(drop)), []);
});
