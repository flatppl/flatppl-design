#!/usr/bin/env node
'use strict';
// Downloads Fuse.js from npm and writes a classic-script bundle to build/fuse.min.js.
//
// Fuse 7+ ships ESM only (no UMD/IIFE). The docs are commonly opened over file://,
// where dynamic import() and <script type="module"> are blocked by browser CORS
// policy. So we take the minified ESM, rewrite its default export into a global
// `Fuse` assignment, and save it as a classic script that works from any origin.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Pinned for reproducible builds; bump deliberately.
const FUSE_VERSION = '7.3.0';
const outFile = path.join('build', 'fuse.min.js');
const stampFile = path.join('build', '.fuse-version');

if (fs.existsSync(outFile) && fs.statSync(outFile).size > 0 && fs.existsSync(stampFile)) {
  const cached = fs.readFileSync(stampFile, 'utf8').trim();
  if (cached === FUSE_VERSION) { process.exit(0); }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuse-'));
try {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(
    npmCmd,
    ['install', '--ignore-scripts', '--prefix', tmpDir, 'fuse.js@' + FUSE_VERSION],
    { stdio: 'inherit', timeout: 60000 }
  );
  if (result.error) { throw result.error; }
  if (result.status !== 0) { throw new Error('npm install fuse.js exited with code ' + result.status); }

  const srcPath = path.join(tmpDir, 'node_modules', 'fuse.js', 'dist', 'fuse.min.mjs');
  const src = fs.readFileSync(srcPath, 'utf8');

  // Rewrite the trailing `export { Name as default }` into a global assignment.
  // Minified output uses a short identifier (e.g. `Y`), so we capture it.
  const exportRe = /export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}\s*;?\s*$/;
  const match = src.match(exportRe);
  if (!match) {
    throw new Error('Could not locate `export { X as default }` in fuse.min.mjs — Fuse build layout changed?');
  }
  const globalAssign = 'globalThis.Fuse=' + match[1] + ';';
  const bundle = src.replace(exportRe, globalAssign);

  fs.mkdirSync('build', { recursive: true });
  fs.writeFileSync(outFile, bundle);
  // Remove stale ESM file from the interim v7-ESM pin so callers don't pick it up.
  const stale = path.join('build', 'fuse.min.mjs');
  if (fs.existsSync(stale)) { fs.rmSync(stale, { force: true }); }
  fs.writeFileSync(stampFile, FUSE_VERSION + '\n');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
