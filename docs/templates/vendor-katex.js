#!/usr/bin/env node
'use strict';
// Downloads the KaTeX distribution from npm and copies it to build/katex/
// so that --katex=./katex/ works for offline docs.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Pinned for reproducible builds; bump deliberately.
const KATEX_VERSION = '0.16.47';
const outDir = path.join('build', 'katex');

// Skip if already populated (allows incremental rebuilds)
if (fs.existsSync(path.join(outDir, 'katex.min.js'))) {
  process.exit(0);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'katex-'));
try {
  // Use spawnSync with an args array (not a shell string) to avoid injection
  // issues with paths that may contain spaces on some systems.
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['install', '--prefix', tmpDir, 'katex@' + KATEX_VERSION], { stdio: 'inherit' });
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
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
