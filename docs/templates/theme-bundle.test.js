const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  prepareTheme,
  verifyThemeBundle,
} = require("./theme-bundle.js");

const repositoryRoot = path.resolve(__dirname, "../..");
const themeBundle = path.join(repositoryRoot, "vendor/flatppl-theme");

test("the vendored release bundle matches every declared size and SHA-256 hash", (context) => {
  assert.deepEqual(verifyThemeBundle(themeBundle), []);

  const alteredBundle = fs.mkdtempSync(path.join(os.tmpdir(), "flatppl-theme-altered-"));
  context.after(() => fs.rmSync(alteredBundle, { recursive: true, force: true }));
  fs.cpSync(themeBundle, alteredBundle, { recursive: true });
  fs.appendFileSync(path.join(alteredBundle, "tokens.css"), "\n");

  assert.deepEqual(verifyThemeBundle(alteredBundle), [
    "tokens.css: size mismatch",
    "tokens.css: SHA-256 mismatch",
  ]);

  const manifestFile = path.join(alteredBundle, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const tokens = manifest.files.find((file) => file.path === "tokens.css");
  const alteredTokens = fs.readFileSync(path.join(alteredBundle, "tokens.css"));
  tokens.size = alteredTokens.length;
  tokens.sha256 = crypto.createHash("sha256").update(alteredTokens).digest("hex");
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.deepEqual(verifyThemeBundle(alteredBundle), [
    "manifest.json: SHA-256 mismatch",
  ]);
});

test("the Pandoc build uses the shared shell fragments and syntax map", (context) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "flatppl-theme-build-"));
  context.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const templates = path.join(workspace, "templates");
  const output = path.join(workspace, "build");
  fs.mkdirSync(templates);
  fs.writeFileSync(
    path.join(templates, "template.html"),
    "<html><!-- flatppl-theme:header --><main></main><!-- flatppl-theme:footer --></html>",
  );
  fs.writeFileSync(
    path.join(templates, "page.html"),
    "<html><!-- flatppl-theme:header --><main></main><!-- flatppl-theme:footer --></html>",
  );
  fs.writeFileSync(path.join(templates, "head.html"), "<head>$pagetitle$</head>\n");

  prepareTheme(themeBundle, templates, output);

  const header = fs.readFileSync(path.join(themeBundle, "header.html"), "utf8").trim();
  const footer = fs.readFileSync(path.join(themeBundle, "footer.html"), "utf8").trim();
  const rendered = fs.readFileSync(path.join(output, "template.html"), "utf8");
  assert.ok(rendered.includes(header));
  assert.ok(rendered.includes(footer));
  assert.equal(
    fs.readFileSync(path.join(output, "head.html"), "utf8"),
    "<head>$pagetitle$</head>\n",
  );

  const syntaxMap = JSON.parse(
    fs.readFileSync(path.join(themeBundle, "syntax-map.json"), "utf8"),
  );
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
