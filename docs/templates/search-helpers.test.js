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
