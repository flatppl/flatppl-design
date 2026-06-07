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
  assert.strictEqual(o.includeMatches, false, 'matches are unused; computing them is dead work (P1)');
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
  // 'b' has a whole-word 'kernel': 0.30 - 0.5 = -0.20, beating 'a' at 0.10.
  const byId = scoresById(boosted);
  assert.ok(byId.b < byId.a, 'exact match outranks fuzzy-only after boost');
  assert.strictEqual(byId.a, 0.10, 'non-matching score untouched');
  assert.ok(byId.b < byId.a, 'whole-word hit ranks above the fuzzy-only typo'); // relative, not pinned to bonus magnitude
});

test('boostExact ranks a whole-word match above a longer-word (substring) match', () => {
  const results = [
    { item: { text: 'normalize the measure first', targetId: 'norm' }, score: 0.10, matches: [] },
    { item: { text: 'the Normal distribution', targetId: 'dist' }, score: 0.20, matches: [] }
  ];
  const out = H.boostExact(results, 'normal');
  const byId = scoresById(out);
  // Relative order is the contract; absolute magnitudes are tunable (see the
  // dedicated gap-vs-threshold invariant test).
  assert.ok(byId.dist < byId.norm, 'whole-word Normal beats substring inside normalize');
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

// Collapse a result array to a { targetId: score } map for terse assertions.
const scoresById = (rows) => Object.fromEntries(rows.map((r) => [r.item.targetId, r.score]));

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
  // B boosted by whole-word bonus; best A is the 0.20 block (fuzzy, no boost).
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

test('boostTables tiers an EXACT table-cell match above equivalent prose', () => {
  // `exact` is set upstream by boostExact; boostTables only lifts exact cells.
  const results = [
    { item: { isTable: true, text: 'Normal', targetId: 'cell' }, score: 0.02, matches: [], exact: true },
    { item: { isTable: false, text: 'a multivariate normal mention', targetId: 'prose' }, score: 0.02, matches: [], exact: true }
  ];
  const out = H.boostTables(results, 0.25);
  const byId = scoresById(out);
  assert.ok(byId.cell < 0.02, 'exact table cell lowered below its raw score by the bonus');
  assert.strictEqual(byId.prose, 0.02, 'prose untouched');
  assert.ok(byId.cell < byId.prose, 'table cell ranks above the tying prose');
});

test('boostTables does NOT lift a FUZZY-only table cell (the "distributed" bug)', () => {
  // A table cell that only fuzzy-matches (exact:false) must get no structural
  // promotion — otherwise it floats above genuine content.
  const out = H.boostTables([{ item: { isTable: true, text: 'Distribution', targetId: 'cell' }, score: 0.24, matches: [], exact: false }], 0.25);
  assert.strictEqual(out[0].score, 0.24, 'fuzzy-only table cell unchanged');
});

test('boostTables leaves non-table results alone', () => {
  const out = H.boostTables([{ item: { isTable: false, text: 'x', targetId: 'a' }, score: 0.5, matches: [], exact: true }], 0.25);
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
  const byId = scoresById(out);
  assert.ok(Math.abs(byId.abs - (0.10 + 0.4)) < 1e-9, 'abstract demoted by the penalty (0.10 + 0.4)');
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

test('dedupeByHeading flags the jackpot section (heading title contains the query) and shows its body', () => {
  const results = [
    { item: { isHeading: true, text: '6.4 Likelihoods and posteriors', heading: 'Likelihoods and posteriors', targetId: 'lhead' }, score: 0.20, matches: [] },
    { item: { isHeading: false, text: 'likelihood objects represent density', heading: 'Likelihoods and posteriors', targetId: 'lbody' }, score: 0.30, matches: [{ key: 'text' }] },
    { item: { isHeading: false, text: 'mentions likelihoods in passing', heading: 'Abstract', targetId: 'other' }, score: 0.05, matches: [] }
  ];
  const out = H.dedupeByHeading(results, 'likelihoods');
  const lk = out.find((r) => r.item.heading === 'Likelihoods and posteriors');
  assert.ok(lk.jackpot, 'section with the title hit is flagged jackpot');
  assert.strictEqual(lk.item.targetId, 'lbody', 'jackpot still shows the body prose');
  const other = out.find((r) => r.item.heading === 'Abstract');
  assert.ok(!other.jackpot, 'a non-title section is not jackpotted');
});

test('buildSnippet highlights the whole query term, not fuzzy fragments', () => {
  const html = H.buildSnippet('The kernel of a measure is central', 'kernel');
  assert.ok(html.indexOf('<mark>kernel</mark>') !== -1, 'whole term highlighted');
  assert.strictEqual((html.match(/<mark>/g) || []).length, 1, 'exactly one mark, no staccato');
});

test('buildSnippet highlights the right span past a length-changing code point (Unicode offset regression)', () => {
  // "İ" (U+0130) lowercases to two code points ("i" + combining dot), so ranges
  // computed on a lowercased copy would be shifted by one and mis-slice the
  // original text — here yielding "<mark>ernel </mark>" instead of the term.
  const html = H.buildSnippet('ABİCD kernel here', 'kernel');
  assert.ok(html.indexOf('<mark>kernel</mark>') !== -1, 'whole term marked at the correct offset');
  assert.strictEqual((html.match(/<mark>/g) || []).length, 1, 'exactly one mark');
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
  const lk = out.find((r) => r.item.targetId === 'lbody');
  assert.ok(lk.jackpot, 'body-only section still jackpots via the heading-path last segment');
  const other = out.find((r) => r.item.targetId === 'other');
  assert.ok(!other.jackpot, 'abstract section not jackpotted');
});

test('computeResults: jackpot leads even when a non-jackpot raw score exceeds 1 (L5)', () => {
  const fuseResults = [
    { item: { isHeading: true, text: 'Normal distribution', heading: 'Normal distribution', sectionId: 'n', targetId: 'nh' }, score: 0.9, matches: [] },
    { item: { isHeading: false, text: 'unrelated', heading: 'Other', sectionId: 'o', targetId: 'ob' }, score: 5.0, matches: [] }
  ];
  const out = H.computeResults({ rawQuery: 'Normal', fuse: fakeFuse(fuseResults), index: [], maxResults: 40 });
  assert.strictEqual(out[0].item.targetId, 'nh', 'jackpot (top tier) leads regardless of large non-jackpot scores');
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

test('computeResults: a jackpot leads even past a strongly-scored non-jackpot (M1)', () => {
  // Jackpot is the top tier, so even a table cell with a very good (low) score
  // and the table bonus cannot displace it.
  const fuseResults = [
    { item: { isHeading: false, text: 'likelihood objects', heading: 'Reference - Likelihoods', sectionId: 'lk', targetId: 'lbody' }, score: 0.80, matches: [] },
    { item: { isTable: true, text: 'Likelihoods', heading: 'Other', sectionId: 'o', targetId: 'cell' }, score: 0.10, matches: [] }
  ];
  const out = H.computeResults({ rawQuery: 'likelihoods', fuse: fakeFuse(fuseResults), index: [], maxResults: 40 });
  assert.strictEqual(out[0].item.targetId, 'lbody', 'jackpot section leads the tier despite the cell scoring/boosting better');
});

test('computeResults: a jackpot leads even with a large raw score vs low-scored others (M1)', () => {
  const fuseResults = [
    { item: { isHeading: true, text: 'Normal distribution', heading: 'Normal distribution', sectionId: 'n', targetId: 'nh' }, score: 10, matches: [] },
    { item: { isHeading: false, text: 'unrelated a', heading: 'A', sectionId: 'a', targetId: 'a' }, score: 0, matches: [] },
    { item: { isHeading: false, text: 'unrelated b', heading: 'B', sectionId: 'b', targetId: 'b' }, score: 2, matches: [] }
  ];
  const out = H.computeResults({ rawQuery: 'Normal', fuse: fakeFuse(fuseResults), index: [], maxResults: 40 });
  assert.strictEqual(out[0].item.targetId, 'nh', 'jackpot leads regardless of its large raw score');
});

test('computeResults: an exact match always outranks a better-fuzz-scored hit (distributed)', () => {
  // The reported bug: searching "distributed" floated fuzzy "Distribution"
  // table cells (Fuse ~0.24 + table bonus) above genuine whole-word content.
  // Exactness is the dominant tier, so the body hit wins even though the cell
  // both scores better fuzzily AND gets the table bonus.
  const fuseResults = [
    { item: { isTable: true, text: 'Distribution', heading: 'Built-in distributions', sectionId: 'tbl', targetId: 'cell' }, score: 0.24, matches: [] },
    { item: { isTable: false, text: 'values are distributed across the DAG', heading: 'Design', sectionId: 'd', targetId: 'body' }, score: 0.40, matches: [] }
  ];
  const out = H.computeResults({ rawQuery: 'distributed', fuse: fakeFuse(fuseResults), index: [], maxResults: 40 });
  assert.strictEqual(out[0].item.targetId, 'body', 'whole-word content beats the fuzzy table cell despite its better score+bonus');
});

test('computeResults: tiers are jackpot < exact < fuzzy', () => {
  // One row per tier; assert the exact order out of computeResults.
  const fuseResults = [
    { item: { isHeading: false, text: 'a fuzzy-only paragraph', heading: 'F', sectionId: 'f', targetId: 'fuzzy' }, score: 0.05, matches: [] },
    { item: { isHeading: false, text: 'the Normal distribution in prose', heading: 'E', sectionId: 'e', targetId: 'exact' }, score: 0.30, matches: [] },
    { item: { isHeading: true, text: 'Normal distribution', heading: 'Normal distribution', sectionId: 'j', targetId: 'jack' }, score: 0.20, matches: [] }
  ];
  const out = H.computeResults({ rawQuery: 'Normal', fuse: fakeFuse(fuseResults), index: [], maxResults: 40 });
  assert.deepStrictEqual(out.map((r) => r.item.targetId), ['jack', 'exact', 'fuzzy'],
    'jackpot first, then exact (despite worse raw score than fuzzy), then fuzzy-only');
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

// --- normalizeHeadingText (single source of truth, exported) ----------------

test('normalizeHeadingText strips section numbers, trailing #s, and collapses whitespace', () => {
  assert.strictEqual(H.normalizeHeadingText('6.4 Likelihoods and posteriors'), 'Likelihoods and posteriors');
  assert.strictEqual(H.normalizeHeadingText('2 Language\n        overview ##'), 'Language overview');
  assert.strictEqual(H.normalizeHeadingText('Distributions #'), 'Distributions');
  assert.strictEqual(H.normalizeHeadingText('   spaced   out   '), 'spaced out');
  assert.strictEqual(H.normalizeHeadingText(null), '', 'null coerces to empty string');
  assert.strictEqual(H.normalizeHeadingText(undefined), '', 'undefined coerces to empty string');
});

test('normalizeHeadingText strips the leading section number even behind source whitespace', () => {
  // Raw el.textContent can carry indentation/newlines BEFORE the digit; collapse
  // + trim must run first so ^[\d.]+ still fires. Guards the docs-app.js path
  // (sidebar labels + demote prefixes) against drift from the index heading path.
  assert.strictEqual(H.normalizeHeadingText('   6.4 Likelihoods'), 'Likelihoods');
  assert.strictEqual(H.normalizeHeadingText('\n    2 Language\n    overview #'), 'Language overview');
});

test('buildIndexEntries stores normalized heading text on the heading row (no section number in snippet)', () => {
  const out = H.buildIndexEntries([{ id: 'h', text: '6.4 Likelihoods and posteriors #', isHeading: true, level: 2 }]);
  assert.strictEqual(out[0].text, 'Likelihoods and posteriors', 'heading-row text is normalized for the snippet');
  assert.strictEqual(out[0].heading, 'Likelihoods and posteriors', 'path matches the normalized title');
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

test('buildIndexEntries normalizes messy heading text (whitespace, trailing #s, number)', () => {
  // Mirrors what the rendered DOM yields: a section number, internal newlines +
  // indentation, and one-or-more trailing anchor "#". The path must come out
  // clean so it reads well AND matches lowercased demote prefixes.
  const out = H.buildIndexEntries([
    { id: 'h', text: '2 Language\n        overview ##', isHeading: true, level: 1 },
    { id: 'p', text: 'body block', isHeading: false, level: 0 }
  ]);
  assert.strictEqual(out[0].heading, 'Language overview', 'heading text cleaned');
  assert.strictEqual(out[1].heading, 'Language overview', 'body inherits the cleaned path');
  assert.strictEqual(out[1].sectionId, 'h');
  assert.strictEqual('Language overview'.toLowerCase().indexOf('language overview'), 0, 'matches demote prefix');
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
  // on a literal match. (boostExact subtracts WHOLE_WORD_BONUS from each; demote
  // +0.4 makes the overview row worse than the ref at equal raw score.)
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
  assert.ok(out[0].score < 0.20, 'whole-word bonus lowered the score below the raw baseline'); // relative, not pinned to bonus magnitude
});

// --- attachElements (PR-37 follow-up #1: guarded el zip) -------------------

test('attachElements zips el refs onto entries by index and returns the same array', () => {
  const index = [{ targetId: 'a' }, { targetId: 'b' }];
  const els = [{ tag: 'P' }, { tag: 'LI' }];
  const out = H.attachElements(index, els);
  assert.strictEqual(out, index, 'mutates and returns the same array');
  assert.strictEqual(out[0].el, els[0]);
  assert.strictEqual(out[1].el, els[1]);
});

test('attachElements returns [] when index and els lengths disagree', () => {
  const index = [{ targetId: 'a' }, { targetId: 'b' }];
  const els = [{ tag: 'P' }];
  assert.deepStrictEqual(H.attachElements(index, els), [], 'length mismatch -> empty index (search degrades to unavailable)');
});

test('attachElements handles empty inputs and non-arrays', () => {
  assert.deepStrictEqual(H.attachElements([], []), []);
  assert.deepStrictEqual(H.attachElements(null, []), [], 'non-array index -> []');
  assert.deepStrictEqual(H.attachElements([{ targetId: 'a' }], null), [], 'non-array els -> []');
});

// --- #2: whole-word regex fallback to substring ----------------------------

test('exactWordHits falls back to substring when the query has no word boundary (#2)', () => {
  // '.foo' starts with a non-word char, so wholeWordRegex() returns null (the
  // same null path taken on engines lacking lookbehind/\p, which throw and are
  // caught). exactWordHits must then use case-insensitive substring containment.
  const index = [
    { text: 'see .foo. marker', targetId: 'a' },
    { text: 'unrelated content', targetId: 'b' }
  ];
  const ids = H.exactWordHits(index, '.foo').map((h) => h.item.targetId);
  assert.deepStrictEqual(ids, ['a'], 'substring fallback finds .foo when whole-word regex is unavailable');
});

// --- #4: query cannot inject HTML via the snippet (XSS regression) ----------

test('buildSnippet cannot inject HTML via the query (XSS regression, #4)', () => {
  // The matched span is sliced from the DOCUMENT text and escaped; the query is
  // only used to locate it, never rendered. Even when the query equals a tag and
  // that tag literally appears in the text, output carries no raw markup.
  const text = 'a <img src=x onerror=alert(1)> blob with kernel here';
  const html = H.buildSnippet(text, '<img src=x onerror=alert(1)>');
  assert.strictEqual(html.indexOf('<img'), -1, 'no raw tag emitted from the matched doc text');
  assert.ok(html.indexOf('&lt;img') !== -1, 'matched text escaped even though it equals the query');
});

// --- #8: deterministic tiebreak (no reliance on Array.sort stability) -------

test('computeResults keeps first-seen order for equal tier and score (#8)', () => {
  // Both rows are fuzzy-only (tier 2) with identical scores and no literal hit,
  // so the only thing that can order them is the explicit first-seen tiebreak.
  const fuseResults = [
    { item: { isHeading: false, text: 'alpha block', heading: 'A', sectionId: 'a', targetId: 'a' }, score: 0.2, matches: [] },
    { item: { isHeading: false, text: 'beta block', heading: 'B', sectionId: 'b', targetId: 'b' }, score: 0.2, matches: [] }
  ];
  const out = H.computeResults({ rawQuery: 'zzz', fuse: fakeFuse(fuseResults), index: [], maxResults: 40 });
  assert.deepStrictEqual(out.map((r) => r.item.targetId), ['a', 'b'], 'first-seen order preserved on a full tie');
});

test('buildSnippet anchors on the densest cluster, not the first lone term (C5)', () => {
  // "alpha" appears once early and far away; "alpha beta" co-occur late. The
  // window should anchor on the dense late cluster and mark both, not the early
  // lone "alpha".
  const text = 'alpha ' + 'x'.repeat(300) + ' alpha beta gamma';
  const html = H.buildSnippet(text, 'alpha beta');
  assert.ok(html.indexOf('<mark>alpha</mark>') !== -1, 'alpha in the dense cluster marked');
  assert.ok(html.indexOf('<mark>beta</mark>') !== -1, 'beta marked — proves the window moved to the dense cluster');
});

test('buildSnippet tolerates a surrogate in a term that reaches RegExp construction (C3)', () => {
  // "a\uD800b" survives the MIN_TERM_LEN filter, so a RegExp is actually built
  // from it (a 1-char surrogate would be filtered out before construction and
  // prove nothing). Dropping the /u/ flag keeps construction safe for such
  // unusual input — a lone surrogate is invalid under /u/ on some engines — so
  // buildSnippet must not throw and must return a string.
  const term = 'a\uD800b';
  assert.doesNotThrow(() => H.snippetRegexes(term));
  assert.doesNotThrow(() => H.buildSnippet('some ordinary text here', term));
  assert.strictEqual(typeof H.buildSnippet('some ordinary text here', term), 'string');
});

test('snippetRegexes compiles escaped, case-insensitive, global term matchers', () => {
  const res = H.snippetRegexes('Kernel a');
  assert.ok(Array.isArray(res));
  assert.ok(res.every((re) => re instanceof RegExp), 'returns RegExp objects');
  assert.ok(res.every((re) => re.flags.indexOf('g') !== -1 && re.flags.indexOf('i') !== -1), 'g + i flags');
  assert.ok(res.every((re) => re.flags.indexOf('u') === -1), 'no u flag');
  // "a" is below MIN_TERM_LEN, so only "kernel" survives.
  assert.strictEqual(res.length, 1);
});

test('buildSnippet accepts precompiled regexes equivalent to string terms (P2)', () => {
  const text = 'The kernel of a measure is central';
  const fromStrings = H.buildSnippet(text, null, undefined, H.snippetTerms('kernel'));
  const fromRegexes = H.buildSnippet(text, null, undefined, H.snippetRegexes('kernel'));
  assert.strictEqual(fromRegexes, fromStrings, 'precompiled regexes produce identical output');
});

test('buildSnippet reuses a precompiled global regex across calls (lastIndex reset)', () => {
  // A /g/ regex carries lastIndex; reusing one across rows must reset it so the
  // second row still matches from the start.
  const res = H.snippetRegexes('kernel');
  const a = H.buildSnippet('kernel one', null, undefined, res);
  const b = H.buildSnippet('kernel two', null, undefined, res);
  assert.ok(a.indexOf('<mark>kernel</mark>') !== -1, 'first call marks');
  assert.ok(b.indexOf('<mark>kernel</mark>') !== -1, 'reused regex still marks the second call');
});

test('boostExact: whole-word outranks substring even at worst-case fuzzy baselines (C2)', () => {
  // The guarantee must hold when the whole-word hit has the WORST allowed fuzzy
  // score (== threshold 0.35) and the substring hit has the BEST (0.0). If the
  // bonus gap did not exceed the threshold, the substring would wrongly win.
  const out = H.boostExact([
    { item: { text: 'the Normal distribution', targetId: 'whole' }, score: 0.35, matches: [] },
    { item: { text: 'normalize the measure', targetId: 'sub' }, score: 0.0, matches: [] }
  ], 'normal');
  const byId = scoresById(out);
  assert.ok(byId.whole < byId.sub, 'whole-word ranks above substring regardless of fuzzy baselines');
});

test('boostExact: mid-word substrings are NOT promoted to the exact tier (C4)', () => {
  // "normal" appears mid-word in "abnormal"; that must stay fuzzy-only (no exact
  // flag, no bonus) so it cannot flood the exact tier. A word-prefix hit
  // ("normalize") is still promoted.
  const out = H.boostExact([
    { item: { text: 'an abnormal case', targetId: 'mid' }, score: 0.20, matches: [] },
    { item: { text: 'normalize first', targetId: 'pre' }, score: 0.20, matches: [] }
  ], 'normal');
  const byId = out.reduce((m, r) => (m[r.item.targetId] = r, m), {});
  assert.strictEqual(byId.mid.exact, false, 'mid-word substring is not exact');
  assert.strictEqual(byId.mid.score, 0.20, 'mid-word substring score untouched');
  assert.strictEqual(byId.pre.exact, true, 'word-prefix substring is still exact');
  assert.ok(byId.pre.score < 0.20, 'word-prefix substring still gets the bonus');
});

test('demoteByHeading flags demoted rows (C1 plumbing)', () => {
  const out = H.demoteByHeading([
    { item: { heading: 'Language overview - intro', targetId: 'a' }, score: 0.1, matches: [] },
    { item: { heading: 'Distributions', targetId: 'b' }, score: 0.1, matches: [] }
  ], ['language overview'], 0.4);
  const byId = out.reduce((m, r) => (m[r.item.targetId] = r, m), {});
  assert.strictEqual(byId.a.demoted, true, 'matching prefix is flagged demoted');
  assert.strictEqual(byId.b.demoted, false, 'non-matching row not demoted');
});

test('dedupeByHeading does NOT jackpot a demoted section (C1)', () => {
  // The doc-title section both contains the query as a heading whole-word AND is
  // demoted. It must not be flagged jackpot, or the demote is defeated.
  const results = [
    { item: { isHeading: true, text: 'FlatPPL, a Flat Portable Probabilistic Language', heading: 'FlatPPL, a Flat Portable Probabilistic Language', sectionId: 'title', targetId: 'th' }, score: 0.1, matches: [], demoted: true },
    { item: { isHeading: false, text: 'a probabilistic intro', heading: 'FlatPPL, a Flat Portable Probabilistic Language', sectionId: 'title', targetId: 'tb' }, score: 0.2, matches: [], demoted: true }
  ];
  const out = H.dedupeByHeading(results, 'probabilistic');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].jackpot, false, 'demoted section is not jackpotted');
  assert.strictEqual(out[0].demoted, true, 'group carries the demoted flag through');
});

test('computeResults: a demoted title section does not lead via jackpot (C1 end-to-end)', () => {
  const fuseResults = [
    { item: { isHeading: true, text: 'FlatPPL Probabilistic', heading: 'FlatPPL Probabilistic', sectionId: 'title', targetId: 'th' }, score: 0.1, matches: [] },
    { item: { isHeading: false, text: 'the probabilistic semantics in detail', heading: 'Semantics', sectionId: 'sem', targetId: 'sb' }, score: 0.30, matches: [] }
  ];
  const out = H.computeResults({
    rawQuery: 'probabilistic', fuse: fakeFuse(fuseResults), index: [], maxResults: 40,
    demoteHeadings: ['flatppl probabilistic'], demotePenalty: 0.4
  });
  assert.strictEqual(out[0].item.targetId, 'sb', 'real content leads; demoted title does not jackpot to the top');
});
