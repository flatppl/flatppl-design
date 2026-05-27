#!/usr/bin/env node
'use strict';
// Downloads Fuse.js from npm and copies fuse.min.js to build/ for offline use.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Pinned for reproducible builds; bump deliberately.
const FUSE_VERSION = '6.6.2';
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
  fs.mkdirSync('build', { recursive: true });
  fs.copyFileSync(path.join(tmpDir, 'node_modules', 'fuse.js', 'dist', 'fuse.min.js'), outFile);
  fs.writeFileSync(stampFile, FUSE_VERSION + '\n');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
