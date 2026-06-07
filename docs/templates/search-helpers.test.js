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

test('exactWordHits returns case-insensitive whole-word matches as score-0 results', () => {
  const index = [
    { text: 'The bayesupdate operator combines a prior', heading: 'A', targetId: 't1' },
    { text: 'Unrelated paragraph about kernels', heading: 'B', targetId: 't2' },
    { text: 'See BayesUpdate for details', heading: 'C', targetId: 't3' }
  ];
  const hits = H.exactWordHits(index, 'bayesupdate');
  const ids = hits.map((h) => h.item.targetId).sort();
  assert.deepStrictEqual(ids, ['t1', 't3']);
  assert.strictEqual(hits[0].score, 0);
  assert.strictEqual(hits[0].matches, null);
});

test('exactWordHits matches whole words only — no flooding on common prefixes', () => {
  const index = [
    { text: 'the Normal distribution', heading: 'A', targetId: 'd' },
    { text: 'normalize the measure', heading: 'B', targetId: 'n' },
    { text: 'an unnormalized superposition', heading: 'C', targetId: 'u' }
  ];
  const ids = H.exactWordHits(index, 'Normal').map((h) => h.item.targetId);
  assert.deepStrictEqual(ids, ['d'], 'only the whole-word Normal, not normalize/unnormalized');
});

test('exactWordHits respects the limit cap (M5)', () => {
  const index = [
    { text: 'kernel one', targetId: 'a' },
    { text: 'kernel two', targetId: 'b' },
    { text: 'kernel three', targetId: 'c' }
  ];
  assert.strictEqual(H.exactWordHits(index, 'kernel', 2).length, 2, 'scan stops once limit hits collected');
  assert.strictEqual(H.exactWordHits(index, 'kernel').length, 3, 'no limit -> all matches');
});

test('boostExact lowers (improves) score for literal substring matches', () => {
  const q = 'kernel';
  const results = [
    { item: { text: 'fuzzy kernal typo here', targetId: 'a' }, score: 0.10, matches: [] },
    { item: { text: 'the kernel of a measure', targetId: 'b' }, score: 0.30, matches: [] }
  ];
  const boosted = H.boostExact(results, q);
  // 'b' has a whole-word 'kernel': 0.30 - 0.3 = 0.0, beating 'a' at 0.10.
  const byId = {};
  boosted.forEach((r) => { byId[r.item.targetId] = r.score; });
  assert.ok(byId.b < byId.a, 'exact match outranks fuzzy-only after boost');
  assert.strictEqual(byId.a, 0.10, 'non-matching score untouched');
  assert.ok(Math.abs(byId.b - 0.0) < 1e-9);
});

test('boostExact ranks a whole-word match above a longer-word (substring) match', () => {
  const results = [
    { item: { text: 'normalize the measure first', targetId: 'norm' }, score: 0.10, matches: [] },
    { item: { text: 'the Normal distribution', targetId: 'dist' }, score: 0.20, matches: [] }
  ];
  const out = H.boostExact(results, 'normal');
  const byId = {};
  out.forEach((r) => { byId[r.item.targetId] = r.score; });
  // dist: whole-word 0.20-0.3=-0.10 ; norm: substring 0.10-0.1=0.0 -> dist wins
  assert.ok(byId.dist < byId.norm, 'whole-word Normal beats substring inside normalize');
  assert.ok(Math.abs(byId.dist - (-0.10)) < 1e-9, 'whole-word bonus 0.3');
  assert.ok(Math.abs(byId.norm - 0.0) < 1e-9, 'substring bonus 0.1');
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
  // B boosted: 0.25 - 0.3 = -0.05; best A is the 0.20 block (fuzzy, no boost).
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

test('demoteByHeading adds a penalty to matching heading prefixes only', () => {
  const results = [
    { item: { heading: 'FlatPPL, a Flat Portable Probabilistic Language', targetId: 'abs' }, score: 0.10, matches: [] },
    { item: { heading: 'Measure algebra and analysis - Likelihoods', targetId: 'ref' }, score: 0.12, matches: [] }
  ];
  const out = H.demoteByHeading(results, ['flatppl, a flat portable probabilistic language'], 0.4);
  const byId = {};
  out.forEach((r) => { byId[r.item.targetId] = r.score; });
  assert.ok(Math.abs(byId.abs - 0.50) < 1e-9, 'abstract demoted 0.10 + 0.4');
  assert.strictEqual(byId.ref, 0.12, 'reference section untouched');
});

test('demoteByHeading penalty is additive — reliably worsens a zero/negative score', () => {
  const out = H.demoteByHeading(
    [{ item: { heading: 'Language overview - tables', targetId: 'z' }, score: -0.2, matches: [] }],
    ['language overview'], 0.4
  );
  // -0.2 + 0.4 = 0.2: genuinely demoted. A multiplier (×>1) would have made a
  // negative score MORE negative (better) — the bug additivity fixes.
  assert.ok(Math.abs(out[0].score - 0.2) < 1e-9, 'additive penalty pushes a negative score up');
});

test('demoteByHeading is prefix-based and case-insensitive', () => {
  const out = H.demoteByHeading(
    [{ item: { heading: 'Language overview - Core concepts', targetId: 'x' }, score: 0.20, matches: [] }],
    ['language overview'], 0.5
  );
  assert.ok(Math.abs(out[0].score - 0.70) < 1e-9);
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
    demoteHeadings: ['flatppl title'], demotePenalty: 0.4
  });
  assert.strictEqual(out[0].item.heading, 'Likelihoods and posteriors', 'jackpot section leads despite abstract scoring lower');
  assert.strictEqual(out[0].item.targetId, 'lbody', 'shows body prose');
});

// --- Regression tests for the PR-37 review fixes ---------------------------

test('computeResults: a demoted overview table cell ranks below real reference prose', () => {
  // Demote and the table bonus are both additive on the one lower-is-better
  // scale; demote (larger) keeps an overview table cell below genuine reference
  // prose even after the table bonus lifted it — the overview never floods on a
  // table hit.
  const fuseResults = [
    { item: { isTable: true, text: 'Normal', heading: 'Language overview - cheatsheet', sectionId: 'ov', targetId: 'ovcell' }, score: 0.20, matches: [] },
    { item: { isTable: false, text: 'the Normal distribution in detail', heading: 'Distributions', sectionId: 'dist', targetId: 'prose' }, score: 0.15, matches: [] }
  ];
  const out = H.computeResults({
    rawQuery: 'Normal', fuse: fakeFuse(fuseResults), index: [], maxResults: 40,
    demoteHeadings: ['language overview'], demotePenalty: 0.4, tableBonus: 0.25
  });
  assert.strictEqual(out[0].item.targetId, 'prose', 'reference prose outranks the demoted overview table cell');
});

test('dedupeByHeading keeps same-titled sections distinct via sectionId (M2)', () => {
  // Two sections share an identical heading-path string but live at different
  // anchors. Keying on sectionId (not the path text) must not merge them.
  const results = [
    { item: { heading: 'Examples', sectionId: 'sec-a', targetId: 'a', isHeading: false }, score: 0.10, matches: [] },
    { item: { heading: 'Examples', sectionId: 'sec-b', targetId: 'b', isHeading: false }, score: 0.20, matches: [] }
  ];
  const out = H.dedupeByHeading(results);
  assert.strictEqual(out.length, 2, 'distinct sectionIds are not collapsed despite identical heading text');
  const ids = out.map((r) => r.item.targetId).sort();
  assert.deepStrictEqual(ids, ['a', 'b']);
});

test('dedupeByHeading jackpots from the heading-path last segment when no heading block is present (L4)', () => {
  // Only body blocks reached the result set; the jackpot must still fire off the
  // section title (last path segment), not depend on an isHeading block.
  const results = [
    { item: { isHeading: false, text: 'likelihood objects represent density', heading: 'Reference - Likelihoods', sectionId: 'lk', targetId: 'lbody' }, score: 0.30, matches: [] },
    { item: { isHeading: false, text: 'mentioned in passing', heading: 'Abstract', sectionId: 'ab', targetId: 'other' }, score: 0.05, matches: [] }
  ];
  const out = H.dedupeByHeading(results, 'likelihoods');
  assert.strictEqual(out[0].item.targetId, 'lbody', 'body-only section still jackpots');
  assert.ok(out[0].score < 0, 'jackpot tiered below zero');
  const other = out.find((r) => r.item.targetId === 'other');
  assert.ok(out[0].score < other.score, 'jackpot beats the lower-raw-scored abstract');
});

test('dedupeByHeading jackpot offset is relative — leads even when raw scores exceed 1 (L5)', () => {
  const results = [
    { item: { isHeading: true, text: 'Normal distribution', heading: 'Normal distribution', sectionId: 'n', targetId: 'nh' }, score: 0.9, matches: [] },
    { item: { isHeading: false, text: 'unrelated', heading: 'Other', sectionId: 'o', targetId: 'ob' }, score: 5.0, matches: [] }
  ];
  const out = H.dedupeByHeading(results, 'Normal');
  assert.strictEqual(out[0].item.targetId, 'nh', 'jackpot leads regardless of large non-jackpot scores');
  const ob = out.find((r) => r.item.targetId === 'ob');
  assert.ok(out[0].score < ob.score, 'jackpot strictly below the 5.0-scored row');
});

test('buildSnippet ignores query terms shorter than the minimum length', () => {
  const html = H.buildSnippet('a kernel of a measure', 'a kernel');
  // 'a' is below MIN_TERM_LEN, so only 'kernel' is highlighted (not every 'a').
  assert.strictEqual((html.match(/<mark>/g) || []).length, 1, 'only the >=2-char term marks');
  assert.ok(html.indexOf('<mark>kernel</mark>') !== -1);
});

test('buildSnippet escapes HTML in the no-match fallback head', () => {
  const html = H.buildSnippet('an <script>alert(1)</script> blob with no hit', 'zzzzz');
  assert.strictEqual(html.indexOf('<script>'), -1, 'raw tag not present in fallback');
  assert.ok(html.indexOf('&lt;script&gt;') !== -1, 'fallback head is escaped');
});

test('buildSnippet appends a trailing ellipsis when text extends past the window', () => {
  const html = H.buildSnippet('kernel ' + 'y'.repeat(400), 'kernel');
  assert.strictEqual(html.slice(-1), '…', 'trailing ellipsis when content is truncated');
});

test('looksLikeIdentifier boundary cases', () => {
  assert.strictEqual(H.looksLikeIdentifier('CDF'), false, 'all-caps acronym lacks a lowercase letter');
  assert.strictEqual(H.looksLikeIdentifier('cdf'), true, 'exactly 3 chars, lowercase');
  assert.strictEqual(H.looksLikeIdentifier('foo_'), true, 'trailing underscore is a valid ident char');
  assert.strictEqual(H.looksLikeIdentifier('_foo'), true, 'leading underscore allowed');
  assert.strictEqual(H.looksLikeIdentifier('a1'), false, 'too short');
});

test('computeResults de-dups identifier exact hits against overlapping Fuse targetIds', () => {
  // Fuse already returned idx1; the exact pass must NOT add a duplicate row for
  // the same targetId, but must still add the genuinely-new idx2.
  const index = [
    { text: 'The bayesupdate operator', heading: 'Ops', sectionId: 's1', targetId: 'idx1' },
    { text: 'see bayesupdate again', heading: 'More', sectionId: 's2', targetId: 'idx2' }
  ];
  const fuseResults = [
    { item: index[0], score: 0.10, matches: [] }
  ];
  const out = H.computeResults({ rawQuery: 'bayesupdate', fuse: fakeFuse(fuseResults), index: index, maxResults: 40 });
  const ids = out.map((r) => r.item.targetId).sort();
  assert.deepStrictEqual(ids, ['idx1', 'idx2'], 'idx1 not duplicated, idx2 added by the exact pass');
});

test('sanitizeQuery handles trailing apostrophe and combined operator clusters', () => {
  // A trailing ' is left intact — it's a Fuse prefix-only operator, inert at the
  // end of a token — while leading !^'= clusters and a trailing $ are stripped.
  assert.strictEqual(H.sanitizeQuery("Bayes'"), "Bayes'", 'trailing apostrophe preserved (inert)');
  assert.strictEqual(H.sanitizeQuery("!^'=stuff$"), 'stuff', 'leading operator cluster + trailing $ stripped');
  assert.strictEqual(H.sanitizeQuery('  ^foo |  bar$  '), 'foo bar', 'mixed operators and OR collapse to literal tokens');
});

// --- Phase-1 jackpot-offset bug (M1) ---------------------------------------

test('dedupeByHeading jackpot leads over a NEGATIVE-scored non-jackpot (M1)', () => {
  // The old offset (maxNonJackpotBase + 1, init 0) ignored negative non-jackpot
  // scores — a table cell at -0.25 could still outrank the jackpot. Confirmed
  // repro: jackpot body base 0.8 vs a -0.25 non-jackpot.
  const results = [
    { item: { isHeading: false, text: 'likelihood objects', heading: 'Reference - Likelihoods', sectionId: 'lk', targetId: 'lbody' }, score: 0.80, matches: [] },
    { item: { isHeading: false, text: 'a table cell', heading: 'Other', sectionId: 'o', targetId: 'cell' }, score: -0.25, matches: [] }
  ];
  const out = H.dedupeByHeading(results, 'likelihoods');
  assert.strictEqual(out[0].item.targetId, 'lbody', 'jackpot leads despite a negative-scored competitor');
  const cell = out.find((r) => r.item.targetId === 'cell');
  assert.ok(out[0].score < cell.score, 'jackpot strictly below the -0.25 non-jackpot');
});

test('dedupeByHeading jackpot leads when its base far exceeds the non-jackpots (M1)', () => {
  // Confirmed repro: jackpot base 10, non-jackpots in [0, 2]. The old formula
  // (offset = 2 + 1 = 3) gave the jackpot 10 - 3 = 7 and sorted it LAST.
  const results = [
    { item: { isHeading: true, text: 'Normal distribution', heading: 'Normal distribution', sectionId: 'n', targetId: 'nh' }, score: 10, matches: [] },
    { item: { isHeading: false, text: 'a', heading: 'A', sectionId: 'a', targetId: 'a' }, score: 0, matches: [] },
    { item: { isHeading: false, text: 'b', heading: 'B', sectionId: 'b', targetId: 'b' }, score: 2, matches: [] }
  ];
  const out = H.dedupeByHeading(results, 'Normal');
  assert.strictEqual(out[0].item.targetId, 'nh', 'high-base jackpot still leads');
  const others = out.filter((r) => r.item.targetId !== 'nh');
  others.forEach((r) => assert.ok(out[0].score < r.score, 'jackpot below every non-jackpot'));
});

test('dedupeByHeading with ALL rows jackpots ranks them sensibly among themselves', () => {
  const results = [
    { item: { isHeading: true, text: 'Normal distribution', heading: 'Normal distribution', sectionId: 'n1', targetId: 'a' }, score: 0.30, matches: [] },
    { item: { isHeading: true, text: 'the Normal kernel', heading: 'the Normal kernel', sectionId: 'n2', targetId: 'b' }, score: 0.10, matches: [] }
  ];
  const out = H.dedupeByHeading(results, 'Normal');
  assert.strictEqual(out.length, 2);
  // dedupeByHeading returns first-seen order (computeResults sorts). With no
  // non-jackpot to clear the offset is 0, so scores equal their base — no
  // spurious tiering — and sorting by score puts the better-scoring 'b' first.
  const byId = {};
  out.forEach((r) => { byId[r.item.targetId] = r.score; });
  assert.ok(Math.abs(byId.a - 0.30) < 1e-9, 'jackpot score unchanged (offset 0)');
  assert.ok(Math.abs(byId.b - 0.10) < 1e-9, 'jackpot score unchanged (offset 0)');
  assert.ok(byId.b < byId.a, 'better-scoring jackpot sorts first');
});

// --- Phase-3 coverage gaps -------------------------------------------------

test('computeResults returns [] for an all-operator query without calling fuse', () => {
  const fuse = fakeFuse([]);
  assert.deepStrictEqual(H.computeResults({ rawQuery: "!^'$", fuse: fuse, index: [] }), []);
  assert.deepStrictEqual(H.computeResults({ rawQuery: '|', fuse: fuse, index: [] }), []);
  assert.strictEqual(fuse.calls.length, 0, 'fuse never searched for an empty sanitized query');
});

test('buildSnippet drops a 2nd term beyond the window but still bounds output (L3)', () => {
  // Window anchors on the first match (start + SNIPPET_WINDOW=200). A second
  // term >200 chars away is outside the window: not highlighted, output bounded.
  const text = 'alpha ' + 'x'.repeat(260) + ' beta';
  const html = H.buildSnippet(text, 'alpha beta');
  assert.ok(html.indexOf('<mark>alpha</mark>') !== -1, 'first (in-window) term marked');
  assert.strictEqual(html.indexOf('<mark>beta</mark>'), -1, 'second term beyond the window not marked');
  assert.strictEqual(html.slice(-1), '…', 'trailing ellipsis since content runs past the window');
});

test('buildSnippet accepts precomputed terms equivalent to deriving them from the query', () => {
  const text = 'The kernel of a measure is central';
  const fromQuery = H.buildSnippet(text, 'kernel');
  const fromTerms = H.buildSnippet(text, null, undefined, H.snippetTerms('kernel'));
  assert.strictEqual(fromTerms, fromQuery, 'precomputed terms produce identical output');
});

test('snippetTerms strips operators and short terms', () => {
  assert.deepStrictEqual(H.snippetTerms('  measure   algebra '), ['measure', 'algebra']);
  assert.deepStrictEqual(H.snippetTerms('a kernel'), ['kernel'], 'sub-MIN_TERM_LEN term dropped');
  assert.deepStrictEqual(H.snippetTerms("'exact"), ['exact']);
});

// --- Phase-3/M4: pure index builder ----------------------------------------

test('buildIndexEntries derives heading paths and own/parent section ids', () => {
  const blocks = [
    { id: 'r', text: 'Reference', isHeading: true, level: 1 },
    { id: 'b1', text: 'kernel prose', isHeading: false, level: 0 },
    { id: 'l', text: 'Likelihoods', isHeading: true, level: 2 },
    { id: 'b2', text: 'likelihood prose', isHeading: false, level: 0 }
  ];
  const out = H.buildIndexEntries(blocks);
  assert.strictEqual(out.length, 4);
  // Heading owns its own section id; body inherits the deepest heading.
  assert.deepStrictEqual(
    out.map((e) => [e.targetId, e.heading, e.sectionId, e.isHeading]),
    [
      ['r', 'Reference', 'r', true],
      ['b1', 'Reference', 'r', false],
      ['l', 'Reference - Likelihoods', 'l', true],
      ['b2', 'Reference - Likelihoods', 'l', false]
    ]
  );
});

test('buildIndexEntries strips leading section numbers from heading text', () => {
  const out = H.buildIndexEntries([{ id: 'h', text: '6.4 Likelihoods and posteriors', isHeading: true, level: 2 }]);
  assert.strictEqual(out[0].heading, 'Likelihoods and posteriors', 'numeric prefix stripped from path');
});

test('buildIndexEntries keeps same-titled sections distinct via their own ids', () => {
  const blocks = [
    { id: 'ex1', text: 'Examples', isHeading: true, level: 2 },
    { id: 'p1', text: 'first example body', isHeading: false, level: 0 },
    { id: 'ex2', text: 'Examples', isHeading: true, level: 2 },
    { id: 'p2', text: 'second example body', isHeading: false, level: 0 }
  ];
  const out = H.buildIndexEntries(blocks);
  assert.strictEqual(out[1].sectionId, 'ex1');
  assert.strictEqual(out[3].sectionId, 'ex2', 'identical heading text, distinct section ids');
  assert.strictEqual(out[1].heading, out[3].heading, 'paths read the same');
});

test('buildIndexEntries resets deeper heading levels when a higher level appears', () => {
  const blocks = [
    { id: 'h1', text: 'A', isHeading: true, level: 1 },
    { id: 'h2', text: 'B', isHeading: true, level: 2 },
    { id: 'h1b', text: 'C', isHeading: true, level: 1 },
    { id: 'p', text: 'body', isHeading: false, level: 0 }
  ];
  const out = H.buildIndexEntries(blocks);
  // After the second level-1 'C', the level-2 'B' must be cleared from the path.
  assert.strictEqual(out[3].heading, 'C', 'deeper stale heading reset');
  assert.strictEqual(out[3].sectionId, 'h1b');
});

test('buildIndexEntries passes isTable through', () => {
  const out = H.buildIndexEntries([
    { id: 'c', text: 'Normal', isHeading: false, level: 0, isTable: true },
    { id: 'p', text: 'prose', isHeading: false, level: 0, isTable: false }
  ]);
  assert.strictEqual(out[0].isTable, true);
  assert.strictEqual(out[1].isTable, false);
});

// --- Ordering-contract invariant (#1) --------------------------------------

test('computeResults: demotion costs a fixed penalty even on a whole-word literal hit', () => {
  // Score-independent invariant: at equal raw score, both whole-word literal
  // hits, the demoted one is worse by exactly DEMOTE_PENALTY and ranks below.
  // Pins DEMOTE_PENALTY vs WHOLE_WORD_BONUS so an overview section never floods
  // on a literal match. (boostExact additive: 0.20 - 0.3 = -0.10 each; demote
  // +0.4 -> 0.30 for the overview row, ref stays -0.10.)
  const fuseResults = [
    { item: { text: 'the Normal distribution overview', heading: 'Language overview - intro', sectionId: 'ov', targetId: 'ov' }, score: 0.20, matches: [] },
    { item: { text: 'the Normal distribution reference', heading: 'Distributions', sectionId: 'd', targetId: 'ref' }, score: 0.20, matches: [] }
  ];
  const out = H.computeResults({
    rawQuery: 'Normal', fuse: fakeFuse(fuseResults), index: [], maxResults: 40,
    demoteHeadings: ['language overview'], demotePenalty: 0.4
  });
  assert.strictEqual(out[0].item.targetId, 'ref', 'non-demoted literal beats the demoted literal at equal raw score');
});

// --- Unicode whole-word boundaries (#2) ------------------------------------

test('exactWordHits boosts non-ASCII identifiers with Unicode word boundaries', () => {
  const index = [
    { text: 'the σ parameter scales the Normal', targetId: 'a' },
    { text: 'σσ is a different token entirely', targetId: 'b' }
  ];
  const ids = H.exactWordHits(index, 'σ').map((h) => h.item.targetId);
  assert.deepStrictEqual(ids, ['a'], 'whole-word σ matches standalone, not inside σσ');
});

test('boostExact applies the whole-word bonus to a non-ASCII term', () => {
  const out = H.boostExact(
    [{ item: { text: 'the σ parameter', targetId: 'x' }, score: 0.20, matches: [] }],
    'σ'
  );
  assert.ok(Math.abs(out[0].score - (-0.10)) < 1e-9, 'whole-word bonus 0.3 applied to a Unicode term');
});
