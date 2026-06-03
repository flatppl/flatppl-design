#!/usr/bin/env node
'use strict';
// Downloads the KaTeX distribution from npm and copies it to build/katex/
// so that --katex=./katex/ works for offline docs.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Version is pinned in package.json (monitored by Dependabot) so a bump there
// changes what gets vendored. Single source of truth.
const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
const KATEX_VERSION = pkg.devDependencies.katex;
const outDir = path.join('build', 'katex');
const stampFile = path.join(outDir, '.version');

// Skip incremental rebuild only when the cached copy matches the pinned version.
// Without this check, bumping KATEX_VERSION would silently keep stale assets.
if (fs.existsSync(path.join(outDir, 'katex.min.js')) && fs.existsSync(stampFile)) {
  const cached = fs.readFileSync(stampFile, 'utf8').trim();
  if (cached === KATEX_VERSION) { process.exit(0); }
}

// Version mismatch or partial cache: wipe and reinstall.
fs.rmSync(outDir, { recursive: true, force: true });

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'katex-'));
try {
  // Use spawnSync with an args array (not a shell string) to avoid injection
  // issues with paths that may contain spaces on some systems.
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  // --ignore-scripts: defense-in-depth against a compromised transitive dep
  // executing postinstall code. KaTeX itself has no install scripts.
  const result = spawnSync(npmCmd, ['install', '--ignore-scripts', '--prefix', tmpDir, 'katex@' + KATEX_VERSION], { stdio: 'inherit', timeout: 120000 });
  if (result.error) { throw result.error; }
  if (result.status !== 0) { throw new Error('npm install katex exited with code ' + result.status); }
  fs.mkdirSync(outDir, { recursive: true });
  fs.cpSync(path.join(tmpDir, 'node_modules', 'katex', 'dist'), outDir, { recursive: true });
  // katex.min.css only uses woff2; remove ttf and woff to save ~876KB
  const fontsDir = path.join(outDir, 'fonts');
  for (const f of fs.readdirSync(fontsDir)) {
    if (f.endsWith('.ttf') || f.endsWith('.woff')) {
      fs.unlinkSync(path.join(fontsDir, f));
    }
  }
  fs.writeFileSync(stampFile, KATEX_VERSION + '\n');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
