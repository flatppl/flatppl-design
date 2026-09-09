const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { prepareTheme, verifyThemeBundle } = require("./theme-bundle.js");
const {
  SAMPLE_FILES,
  temporaryDirectory,
  writeBundle,
  writeManifest,
} = require("./theme-fixture.js");

function bundleFixture(context, options) {
  const bundle = temporaryDirectory("flatppl-theme-bundle-");
  context.after(() => fs.rmSync(bundle, { recursive: true, force: true }));
  writeBundle(bundle, options);
  return bundle;
}

test("a bundle that matches its own manifest verifies clean", (context) => {
  const bundle = bundleFixture(context);
  assert.deepEqual(verifyThemeBundle(bundle), []);
  assert.deepEqual(verifyThemeBundle(bundle, { release: "v0.1.8" }), []);
});

test("a tampered file fails the self-check", (context) => {
  const bundle = bundleFixture(context);
  fs.appendFileSync(path.join(bundle, "tokens.css"), "\n");
  assert.deepEqual(verifyThemeBundle(bundle), [
    "tokens.css: size mismatch",
    "tokens.css: SHA-256 mismatch",
  ]);

  // Rewriting the manifest over the tampered file is exactly what the dropped
  // hash pin used to catch; the point of the self-check is the bundle's
  // internal consistency, and the release tag is the remaining pin.
  writeManifest(bundle);
  assert.deepEqual(verifyThemeBundle(bundle), []);
});

test("undeclared and missing files fail the self-check", (context) => {
  const bundle = bundleFixture(context);
  fs.writeFileSync(path.join(bundle, "extra.css"), "/* not in the release */\n");
  fs.rmSync(path.join(bundle, "assets/logo.svg"));
  assert.deepEqual(verifyThemeBundle(bundle), [
    "extra.css: not declared in manifest",
    "assets/logo.svg: missing",
  ]);
});

test("a manifest for another package or release fails the self-check", (context) => {
  const other = bundleFixture(context, { name: "other-theme", release: "v0.1.7" });
  assert.deepEqual(verifyThemeBundle(other, { release: "v0.1.8" }), [
    "manifest: unexpected name",
    "manifest: expected release v0.1.8, found v0.1.7",
  ]);
});

test("a bundle without a manifest is an unverified sibling copy", (context) => {
  const bundle = bundleFixture(context, { manifest: false });
  const warnings = [];
  context.mock.method(console, "warn", (message) => warnings.push(message));

  assert.deepEqual(verifyThemeBundle(bundle), []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /UNVERIFIED sibling checkout/);
});

test("a missing bundle says how to fetch it", () => {
  const missing = path.join(temporaryDirectory("flatppl-theme-missing-"), "vendor/flatppl-theme");
  assert.deepEqual(verifyThemeBundle(missing), [
    `${missing}: no theme bundle; run \`pixi run _fetch-theme\``,
  ]);
});

for (const manifest of [true, false]) {
  const kind = manifest ? "release bundle" : "sibling copy";
  test(`the Pandoc build uses the shell fragments and syntax map of a ${kind}`, (context) => {
    const bundle = bundleFixture(context, { manifest });
    const workspace = temporaryDirectory("flatppl-theme-build-");
    context.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
    context.mock.method(console, "warn", () => {});

    const templates = path.join(workspace, "templates");
    const output = path.join(workspace, "build");
    fs.mkdirSync(templates);
    for (const filename of ["template.html", "page.html"]) {
      fs.writeFileSync(
        path.join(templates, filename),
        "<html><!-- flatppl-theme:header --><main></main><!-- flatppl-theme:footer --></html>",
      );
    }
    fs.writeFileSync(path.join(templates, "head.html"), "<head>$pagetitle$</head>\n");

    prepareTheme(bundle, templates, output);

    const header = SAMPLE_FILES["header.html"].trim()
      .replace('href="https://github.com/flatppl"', 'href="https://github.com/flatppl/flatppl-design"');
    const rendered = fs.readFileSync(path.join(output, "template.html"), "utf8");
    assert.ok(rendered.includes(header));
    assert.ok(rendered.includes(SAMPLE_FILES["footer.html"].trim()));
    assert.equal(
      fs.readFileSync(path.join(output, "head.html"), "utf8"),
      "<head>$pagetitle$</head>\n",
    );
    assert.ok(fs.existsSync(path.join(output, "flatppl-theme/assets/logo.svg")));

    const syntaxMap = JSON.parse(SAMPLE_FILES["syntax-map.json"]);
    const syntaxCss = fs.readFileSync(path.join(output, "flatppl-syntax.css"), "utf8");
    for (const group of syntaxMap.groups) {
      for (const className of group.pandocClasses) {
        assert.match(
          syntaxCss,
          new RegExp(`code span\\.${className} \\{ color: var\\(${group.cssVariable}\\); \\}`),
        );
      }
    }
  });
}
