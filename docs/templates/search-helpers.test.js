'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./search-helpers.js');

test('module loads and exposes its API', () => {
  assert.strictEqual(typeof H, 'object');
  assert.strictEqual(H.__loaded, true);
});
