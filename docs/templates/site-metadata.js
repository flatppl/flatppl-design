const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const revision = git('rev-parse', 'HEAD');
writeFileSync('build/site-metadata.json', JSON.stringify({
  description: 'The FlatPPL language specification: syntax, values, measure algebra, distributions, examples, and implementation profiles.',
  'canonical-url': 'https://spec.flatppl.org/',
  'source-revision': revision,
  'source-short': revision.slice(0, 7),
  'source-date': git('show', '-s', '--format=%cs', 'HEAD'),
  'source-dirty': git('status', '--porcelain', '--untracked-files=normal', '--', 'docs', 'pixi.toml', 'pixi.lock', 'vendor') !== '',
}, null, 2) + '\n');
