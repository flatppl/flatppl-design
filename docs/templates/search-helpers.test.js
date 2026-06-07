'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./search-helpers.js');

test('module loads and exposes its API', () => {
  assert.strictEqual(typeof H, 'object');
  assert.strictEqual(H.__loaded, true);
});

test('searchFuseOptions weights text above heading and enables extended search', () => {
  const o = H.searchFuseOptions;
  assert.ok(Array.isArray(o.keys));
  const text = o.keys.find((k) => k.name === 'text');
  const heading = o.keys.find((k) => k.name === 'heading');
  assert.ok(text && heading, 'both text and heading keys present');
  assert.ok(text.weight > heading.weight, 'text outranks heading');
  assert.strictEqual(o.useExtendedSearch, true);
  assert.strictEqual(o.includeScore, true);
  assert.strictEqual(o.includeMatches, true);
  assert.strictEqual(o.ignoreLocation, true);
  assert.strictEqual(o.threshold, 0.35);
  assert.strictEqual(o.minMatchCharLength, 2);
});

test('sanitizeQuery trims, collapses whitespace, strips Fuse operators', () => {
  assert.strictEqual(H.sanitizeQuery('  foo   bar '), 'foo bar');
  assert.strictEqual(H.sanitizeQuery("'exact"), 'exact');     // leading exact-match op
  assert.strictEqual(H.sanitizeQuery('price$'), 'price');     // trailing suffix op
  assert.strictEqual(H.sanitizeQuery('!neg'), 'neg');         // leading inverse op
  assert.strictEqual(H.sanitizeQuery('^pre'), 'pre');         // leading prefix op
  assert.strictEqual(H.sanitizeQuery('a | b'), 'a b');        // OR operator dropped
  assert.strictEqual(H.sanitizeQuery('Int|Float'), 'Int Float'); // mid-token | -> space, not OR
  assert.strictEqual(H.sanitizeQuery(''), '');
  assert.strictEqual(H.sanitizeQuery(null), '');
});

test('looksLikeIdentifier recognizes single-token identifiers', () => {
  assert.strictEqual(H.looksLikeIdentifier('bayesupdate'), true);
  assert.strictEqual(H.looksLikeIdentifier('kernelof'), true);
  assert.strictEqual(H.looksLikeIdentifier('measure algebra'), false); // has space
  assert.strictEqual(H.looksLikeIdentifier('IO'), false);              // too short
  assert.strictEqual(H.looksLikeIdentifier('123'), false);             // not ident-start
  assert.strictEqual(H.looksLikeIdentifier(''), false);
});

test('exactSubstringHits returns case-insensitive substring matches as score-0 results', () => {
  const index = [
    { text: 'The bayesupdate operator combines a prior', heading: 'A', targetId: 't1' },
    { text: 'Unrelated paragraph about kernels', heading: 'B', targetId: 't2' },
    { text: 'See BayesUpdate for details', heading: 'C', targetId: 't3' }
  ];
  const hits = H.exactSubstringHits(index, 'bayesupdate');
  const ids = hits.map((h) => h.item.targetId).sort();
  assert.deepStrictEqual(ids, ['t1', 't3']);
  assert.strictEqual(hits[0].score, 0);
  assert.strictEqual(hits[0].matches, null);
});

test('boostExact lowers (improves) score for literal substring matches', () => {
  const q = 'kernel';
  const results = [
    { item: { text: 'fuzzy kernal typo here', targetId: 'a' }, score: 0.10, matches: [] },
    { item: { text: 'the kernel of a measure', targetId: 'b' }, score: 0.30, matches: [] }
  ];
  const boosted = H.boostExact(results, q);
  // 'b' has a literal 'kernel' substring: 0.30 * 0.3 = 0.09, beating 'a' at 0.10.
  const byId = {};
  boosted.forEach((r) => { byId[r.item.targetId] = r.score; });
  assert.ok(byId.b < byId.a, 'exact match outranks fuzzy-only after boost');
  assert.strictEqual(byId.a, 0.10, 'non-matching score untouched');
  assert.ok(Math.abs(byId.b - 0.09) < 1e-9);
});

test('boostExact is case-insensitive and tolerates missing score', () => {
  const boosted = H.boostExact(
    [{ item: { text: 'The KERNEL', targetId: 'x' }, matches: [] }],
    'kernel'
  );
  assert.ok(boosted[0].score < 1, 'missing score defaults to 1 then boosts');
});

test('dedupeByHeading keeps the best-scoring result per heading, preserving first-seen order', () => {
  const results = [
    { item: { heading: 'Measure algebra', targetId: 'a' }, score: 0.40, matches: [] },
    { item: { heading: 'Measure algebra', targetId: 'b' }, score: 0.10, matches: [] },
    { item: { heading: 'Distributions', targetId: 'c' }, score: 0.20, matches: [] }
  ];
  const out = H.dedupeByHeading(results);
  assert.strictEqual(out.length, 2, 'two distinct headings');
  assert.strictEqual(out[0].item.targetId, 'b', 'best of "Measure algebra" group');
  assert.strictEqual(out[0].item.heading, 'Measure algebra');
  assert.strictEqual(out[1].item.targetId, 'c');
});

test('dedupeByHeading falls back to targetId when heading is empty', () => {
  const results = [
    { item: { heading: '', targetId: 'a' }, score: 0.5, matches: [] },
    { item: { heading: '', targetId: 'b' }, score: 0.5, matches: [] }
  ];
  assert.strictEqual(H.dedupeByHeading(results).length, 2, 'empty headings not collapsed together');
});

function fakeFuse(returnValue) {
  return {
    calls: [],
    search: function (q, opts) { this.calls.push({ q: q, opts: opts }); return returnValue; }
  };
}

test('computeResults returns [] for an empty/whitespace query and does not call fuse', () => {
  const fuse = fakeFuse([]);
  assert.deepStrictEqual(H.computeResults({ rawQuery: '   ', fuse: fuse, index: [] }), []);
  assert.strictEqual(fuse.calls.length, 0);
});

test('computeResults sanitizes the query before searching', () => {
  const fuse = fakeFuse([]);
  H.computeResults({ rawQuery: "  'kernel  ", fuse: fuse, index: [] });
  assert.strictEqual(fuse.calls[0].q, 'kernel');
});

test('computeResults dedupes by heading and sorts by boosted score', () => {
  const index = [];
  const fuseResults = [
    { item: { text: 'fuzzy only', heading: 'A', targetId: 'a' }, score: 0.20, matches: [] },
    { item: { text: 'has kernel literally', heading: 'B', targetId: 'b' }, score: 0.25, matches: [] },
    { item: { text: 'another A block', heading: 'A', targetId: 'a2' }, score: 0.50, matches: [] }
  ];
  const out = H.computeResults({ rawQuery: 'kernel', fuse: fakeFuse(fuseResults), index: index, maxResults: 40 });
  assert.strictEqual(out.length, 2, 'A collapsed to one, plus B');
  // B boosted: 0.25 * 0.3 = 0.075; best A is the 0.20 block (fuzzy, no boost).
  assert.strictEqual(out[0].item.targetId, 'b', 'boosted exact match ranks first');
});

test('computeResults merges identifier exact hits the fuzzy search missed', () => {
  const index = [
    { text: 'The bayesupdate operator', heading: 'Ops', targetId: 'idx1' }
  ];
  // Fuse returns nothing for the identifier query; the exact pass must supply it.
  const out = H.computeResults({ rawQuery: 'bayesupdate', fuse: fakeFuse([]), index: index, maxResults: 40 });
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].item.targetId, 'idx1');
});

test('computeResults respects maxResults', () => {
  const fuseResults = [];
  for (let i = 0; i < 10; i++) {
    fuseResults.push({ item: { text: 't' + i, heading: 'H' + i, targetId: 'id' + i }, score: 0.1 * i, matches: [] });
  }
  const out = H.computeResults({ rawQuery: 'zzz', fuse: fakeFuse(fuseResults), index: [], maxResults: 3 });
  assert.strictEqual(out.length, 3);
});
