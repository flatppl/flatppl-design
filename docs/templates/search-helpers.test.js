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

test('exactSubstringHits matches whole words only — no flooding on common prefixes', () => {
  const index = [
    { text: 'the Normal distribution', heading: 'A', targetId: 'd' },
    { text: 'normalize the measure', heading: 'B', targetId: 'n' },
    { text: 'an unnormalized superposition', heading: 'C', targetId: 'u' }
  ];
  const ids = H.exactSubstringHits(index, 'Normal').map((h) => h.item.targetId);
  assert.deepStrictEqual(ids, ['d'], 'only the whole-word Normal, not normalize/unnormalized');
});

test('boostExact lowers (improves) score for literal substring matches', () => {
  const q = 'kernel';
  const results = [
    { item: { text: 'fuzzy kernal typo here', targetId: 'a' }, score: 0.10, matches: [] },
    { item: { text: 'the kernel of a measure', targetId: 'b' }, score: 0.30, matches: [] }
  ];
  const boosted = H.boostExact(results, q);
  // 'b' has a whole-word 'kernel': 0.30 * 0.25 = 0.075, beating 'a' at 0.10.
  const byId = {};
  boosted.forEach((r) => { byId[r.item.targetId] = r.score; });
  assert.ok(byId.b < byId.a, 'exact match outranks fuzzy-only after boost');
  assert.strictEqual(byId.a, 0.10, 'non-matching score untouched');
  assert.ok(Math.abs(byId.b - 0.075) < 1e-9);
});

test('boostExact ranks a whole-word match above a longer-word (substring) match', () => {
  const results = [
    { item: { text: 'normalize the measure first', targetId: 'norm' }, score: 0.10, matches: [] },
    { item: { text: 'the Normal distribution', targetId: 'dist' }, score: 0.20, matches: [] }
  ];
  const out = H.boostExact(results, 'normal');
  const byId = {};
  out.forEach((r) => { byId[r.item.targetId] = r.score; });
  // dist: whole-word 0.20*0.25=0.05 ; norm: substring 0.10*0.6=0.06 -> dist wins
  assert.ok(byId.dist < byId.norm, 'whole-word Normal beats substring inside normalize');
  assert.ok(Math.abs(byId.dist - 0.05) < 1e-9, 'whole-word factor 0.25');
  assert.ok(Math.abs(byId.norm - 0.06) < 1e-9, 'substring factor 0.6');
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

test('boostTables tiers table-cell matches above equivalent prose', () => {
  const results = [
    { item: { isTable: true, text: 'Normal', targetId: 'cell' }, score: 0.02, matches: [] },
    { item: { isTable: false, text: 'a multivariate normal mention', targetId: 'prose' }, score: 0.02, matches: [] }
  ];
  const out = H.boostTables(results, 0.25);
  const byId = {};
  out.forEach((r) => { byId[r.item.targetId] = r.score; });
  assert.ok(Math.abs(byId.cell - (-0.23)) < 1e-9, 'table lowered by the bonus');
  assert.strictEqual(byId.prose, 0.02, 'prose untouched');
  assert.ok(byId.cell < byId.prose, 'table cell ranks above the tying prose');
});

test('boostTables leaves non-table results alone', () => {
  const out = H.boostTables([{ item: { isTable: false, text: 'x', targetId: 'a' }, score: 0.5, matches: [] }], 0.25);
  assert.strictEqual(out[0].score, 0.5);
});

test('computeResults boosts a table match above a tying prose match', () => {
  const fuseResults = [
    { item: { isTable: false, text: 'multivariate normal in prose', heading: 'Context', targetId: 'prose' }, score: 0.01, matches: [] },
    { item: { isTable: true, text: 'Normal', heading: 'Built-in distributions', targetId: 'cell' }, score: 0.01, matches: [] }
  ];
  const out = H.computeResults({ rawQuery: 'Normal', fuse: fakeFuse(fuseResults), index: [], maxResults: 40 });
  assert.strictEqual(out[0].item.targetId, 'cell', 'table cell wins the tie');
});

test('dedupeByHeading prefers the body block for display, ranking by best-in-group score', () => {
  const results = [
    { item: { isHeading: true, text: 'Kernels', heading: 'K', targetId: 'head' }, score: 0.10, matches: [] },
    { item: { isHeading: false, text: 'kernels prose', heading: 'K', targetId: 'body' }, score: 0.30, matches: [] }
  ];
  const out = H.dedupeByHeading(results); // no query -> no jackpot
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].item.targetId, 'body', 'body preferred for display');
  assert.strictEqual(out[0].score, 0.10, 'rank is best-in-group score');
});

test('demoteByHeading multiplies score for matching heading prefixes only', () => {
  const results = [
    { item: { heading: 'FlatPPL, a Flat Portable Probabilistic Language', targetId: 'abs' }, score: 0.10, matches: [] },
    { item: { heading: 'Measure algebra and analysis - Likelihoods', targetId: 'ref' }, score: 0.12, matches: [] }
  ];
  const out = H.demoteByHeading(results, ['flatppl, a flat portable probabilistic language'], 1.6);
  const byId = {};
  out.forEach((r) => { byId[r.item.targetId] = r.score; });
  assert.ok(Math.abs(byId.abs - 0.16) < 1e-9, 'abstract demoted 0.10*1.6');
  assert.strictEqual(byId.ref, 0.12, 'reference section untouched');
});

test('demoteByHeading is prefix-based and case-insensitive', () => {
  const out = H.demoteByHeading(
    [{ item: { heading: 'Language overview - Core concepts', targetId: 'x' }, score: 0.20, matches: [] }],
    ['language overview'], 2
  );
  assert.ok(Math.abs(out[0].score - 0.40) < 1e-9);
});

test('dedupeByHeading jackpots a section whose heading title contains the query', () => {
  const results = [
    { item: { isHeading: true, text: '6.4 Likelihoods and posteriors', heading: 'Likelihoods and posteriors', targetId: 'lhead' }, score: 0.20, matches: [] },
    { item: { isHeading: false, text: 'likelihood objects represent density', heading: 'Likelihoods and posteriors', targetId: 'lbody' }, score: 0.30, matches: [{ key: 'text' }] },
    { item: { isHeading: false, text: 'mentions likelihoods in passing', heading: 'Abstract', targetId: 'other' }, score: 0.05, matches: [] }
  ];
  const out = H.dedupeByHeading(results, 'likelihoods');
  assert.strictEqual(out[0].item.heading, 'Likelihoods and posteriors');
  assert.strictEqual(out[0].item.targetId, 'lbody', 'jackpot still shows the body prose');
  assert.ok(out[0].score < 0, 'jackpot rank is tiered below zero so it always leads');
  const other = out.find((r) => r.item.heading === 'Abstract');
  assert.ok(out[0].score < other.score, 'jackpot beats a lower-raw-scored non-heading match');
});

test('buildSnippet highlights the whole query term, not fuzzy fragments', () => {
  const html = H.buildSnippet('The kernel of a measure is central', 'kernel');
  assert.ok(html.indexOf('<mark>kernel</mark>') !== -1, 'whole term highlighted');
  assert.strictEqual((html.match(/<mark>/g) || []).length, 1, 'exactly one mark, no staccato');
});

test('buildSnippet highlights each query term, preserving original case', () => {
  const html = H.buildSnippet('Measure Algebra defines the measure operations', 'measure algebra');
  assert.ok(/<mark>Measure<\/mark>/.test(html), 'first term, original case');
  assert.ok(/<mark>Algebra<\/mark>/.test(html), 'second term, original case');
});

test('buildSnippet escapes HTML in both text and marks', () => {
  const html = H.buildSnippet('use <tag> and kernel & more', 'kernel');
  assert.strictEqual(html.indexOf('<tag>'), -1, 'raw tag not present');
  assert.ok(html.indexOf('&lt;tag&gt;') !== -1, 'tag escaped');
  assert.ok(html.indexOf('&amp;') !== -1, 'ampersand escaped');
  assert.ok(html.indexOf('<mark>kernel</mark>') !== -1);
});

test('buildSnippet falls back to head text when no term matches literally', () => {
  const html = H.buildSnippet('completely unrelated content here', 'zzzzz');
  assert.strictEqual(html.indexOf('<mark>'), -1, 'nothing highlighted');
  assert.ok(html.indexOf('completely unrelated') !== -1, 'shows head of text');
});

test('buildSnippet adds a leading ellipsis when the window starts mid-text', () => {
  const long = 'x'.repeat(200) + ' kernel tail';
  const html = H.buildSnippet(long, 'kernel');
  assert.strictEqual(html.indexOf('…'), 0, 'leading ellipsis');
  assert.ok(html.indexOf('<mark>kernel</mark>') !== -1, 'match still in window');
});

test('computeResults: exact-heading jackpot + demote — section wins over a lower-scored abstract', () => {
  const fuseResults = [
    { item: { isHeading: false, text: 'abstract mentions likelihoods a lot', heading: 'FlatPPL Title', targetId: 'abs' }, score: 0.04, matches: [] },
    { item: { isHeading: true, text: 'Likelihoods and posteriors', heading: 'Likelihoods and posteriors', targetId: 'lhead' }, score: 0.20, matches: [] },
    { item: { isHeading: false, text: 'likelihood objects represent density', heading: 'Likelihoods and posteriors', targetId: 'lbody' }, score: 0.30, matches: [{ key: 'text' }] }
  ];
  const out = H.computeResults({
    rawQuery: 'likelihoods', fuse: fakeFuse(fuseResults), index: [], maxResults: 40,
    demoteHeadings: ['flatppl title'], demoteFactor: 1.6
  });
  assert.strictEqual(out[0].item.heading, 'Likelihoods and posteriors', 'jackpot section leads despite abstract scoring lower');
  assert.strictEqual(out[0].item.targetId, 'lbody', 'shows body prose');
});
