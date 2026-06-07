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
