'use strict';
// Pure search query/result logic for the docs full-text search.
//
// Dual-mode: loads as a classic browser script (defines window.SearchHelpers,
// safe over file://) AND as a Node module (module.exports) so the pure
// functions can be unit-tested with `node --test` without a DOM or a live Fuse.
//
// NO DOM access and NO direct Fuse dependency live here — computeResults takes
// an already-built fuse instance as an argument, so every function is testable
// against plain objects.
//
// @typedef {Object} SearchItem — the index-item contract shared between the DOM
// index build (docs-app.js gathers raw blocks) and this module's ranking. The
// canonical producer is buildIndexEntries() below, which OWNS these field names;
// docs-app.js only attaches `.el` afterwards. Fields:
//   text      {string}  indexed block text (PRE capped upstream)
//   heading   {string}  ' - '-joined ancestor heading path
//   sectionId {string}  anchor id of the owning section heading (groups rows)
//   targetId  {string}  this block's own anchor id (result href + scroll target)
//   isHeading {boolean} block is itself a heading
//   isTable   {boolean} block lives inside a reference <table>
//   el        {Node}    live DOM node; attached by docs-app.js, never read here
(function (factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.SearchHelpers = api; }
})(function () {
  'use strict';

  // Tunables. Scores are lower-is-better; ranking tiers are expressed relative
  // to each other here so the pipeline stays legible.
  var RADIUS = 60;             // chars of context kept on each side of a hit
  var SNIPPET_WINDOW = 200;    // max snippet length once anchored on a hit
  var HEAD_LEN = 140;          // fallback snippet length when no term matches
  var MIN_TERM_LEN = 2;        // ignore query terms shorter than this
  // Exact-match boosts are ADDITIVE (subtracted from the lower-is-better score)
  // so they compose on one scale with the table/demote/jackpot tiers and, unlike
  // a multiplier, still tier a score-0 exact hit (0 * factor = 0 would not).
  // Whole word is subtracted more than a substring, and the gap
  // (0.3 - 0.1 = 0.2) exceeds any single raw Fuse score (capped by threshold
  // 0.35) so a whole-word hit outranks a substring hit regardless of their
  // fuzzy baselines.
  var WHOLE_WORD_BONUS = 0.3;  // additive: whole-word literal match (strong)
  var SUBSTRING_BONUS = 0.1;   // additive: substring literal match (mild)
  var TABLE_BONUS = 0.25;       // reference-table cell lift (additive, better)
  var DEMOTE_PENALTY = 0.4;     // frontmatter/overview push-down (additive, worse)
  // ORDERING CONTRACT — since boostExact became additive, these four live on
  // ONE lower-is-better scale and their magnitudes are load-bearing RELATIVE to
  // each other, not just individually. Retune them as a SET, not one at a time.
  // The score-independent invariants (pinned by regression tests) are:
  //   * literal beats fuzzy-only            — bonuses > 0
  //   * whole word beats substring          — gap 0.3-0.1=0.2 exceeds the max
  //     raw Fuse score (threshold 0.35), so the order holds at any baseline
  //   * demotion costs a fixed net penalty  — a demoted hit is worse by exactly
  //     DEMOTE_PENALTY than the same hit undemoted, regardless of any boost, so
  //     an overview/abstract section never floods even on an exact match
  // (Whether a demoted literal outranks a *different* non-demoted fuzzy hit is
  // score-dependent — that comparison is a tuning question, not an invariant.)

  // #1 (heading-weighted keys) + #5 (multi-word AND via extended search).
  // useExtendedSearch makes a space-separated query an AND of fuzzy tokens.
  var searchFuseOptions = {
    keys: [
      { name: 'text', weight: 0.7 },
      { name: 'heading', weight: 0.3 }
    ],
    includeScore: true,
    includeMatches: true,
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
    useExtendedSearch: true
  };

  // #5 safety: extended search treats !, ^, ', =, $, | as operators. Strip them
  // from user input so typed text matches literally instead of triggering
  // surprising operator behavior. | (OR) is turned to a space everywhere — even
  // mid-token (e.g. "Int|Float") — so it never flips the query to OR. Per
  // remaining token: drop leading !^'= and trailing $; collapse whitespace.
  function sanitizeQuery(raw) {
    if (!raw) return '';
    return String(raw)
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(function (t) { return t.replace(/^[!^'=]+/, '').replace(/\$+$/, ''); })
      .filter(function (t) { return t; })
      .join(' ');
  }

  // Text-context-only HTML escaping: escapes & < > so a string is safe inside
  // element text / innerHTML between tags. NOT attribute-safe (quotes are left
  // intact); only use the output as element content, never inside an attribute.
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Case-insensitive whole-word matcher for a query, or null if the query can't
  // form a word boundary (e.g. starts/ends with punctuation). Used to rank a
  // whole-word hit ("Normal") above the same letters inside a longer word
  // ("normalize"). The returned regex has no `g` flag, so `.test()` is stateless
  // and the instance can be shared across many calls within one search.
  function wholeWordRegex(q) {
    if (!q) return null;
    try {
      // Unicode-aware "whole word": no letter/number/underscore on either side.
      // JS \b is ASCII-only, so we build explicit boundaries from \p{L}\p{N} to
      // also boost non-ASCII identifiers (e.g. Greek math symbols in the docs).
      // If the query edge isn't a word char the regex can't mean "whole word",
      // so don't use it. On engines lacking lookbehind/\p support the RegExp
      // construction throws and we fall back to substring matching (caught).
      var WORD = '[\\p{L}\\p{N}_]';
      var edge = new RegExp(WORD, 'u');
      if (!edge.test(q.charAt(0)) || !edge.test(q.charAt(q.length - 1))) return null;
      return new RegExp('(?<!' + WORD + ')' + escapeRegExp(q) + '(?!' + WORD + ')', 'iu');
    } catch (e) { return null; }
  }

  // Clean, term-based snippet highlighter. Highlights the user's actual query
  // terms (case-insensitive whole substrings) rather than Fuse's per-character
  // fuzzy indices, which scatter staccato single-letter <mark>s across the text.
  // Builds a ~200-char window anchored on the first matched term and returns
  // escaped HTML with <mark> spans and … ellipses. If no term occurs literally,
  // returns the head of the text (still useful context). Original case is kept.
  // Lowercased query terms (>= MIN_TERM_LEN) as buildSnippet matches them.
  // Exported so a caller rendering many rows can compute the terms ONCE and pass
  // them into buildSnippet instead of re-sanitizing the same query per row.
  function snippetTerms(query) {
    return sanitizeQuery(query).toLowerCase().split(' ').filter(function (t) { return t.length >= MIN_TERM_LEN; });
  }

  function buildSnippet(text, query, radius, terms) {
    text = text == null ? '' : String(text);
    if (typeof radius !== 'number') radius = RADIUS;
    // `terms` may be precomputed by the caller (see snippetTerms) to skip the
    // per-row sanitize; otherwise derive them from `query`.
    if (!Array.isArray(terms)) terms = snippetTerms(query);
    var lower = text.toLowerCase();

    var ranges = [];
    for (var t = 0; t < terms.length; t++) {
      var term = terms[t];
      var from = 0, idx;
      while ((idx = lower.indexOf(term, from)) !== -1) {
        ranges.push([idx, idx + term.length]);
        from = idx + term.length;
      }
    }
    if (!ranges.length) {
      var head = escapeHtml(text.slice(0, HEAD_LEN));
      return text.length > HEAD_LEN ? head + '…' : head;
    }

    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [ranges[0].slice()];
    for (var i = 1; i < ranges.length; i++) {
      var top = merged[merged.length - 1];
      if (ranges[i][0] <= top[1]) { if (ranges[i][1] > top[1]) top[1] = ranges[i][1]; }
      else { merged.push(ranges[i].slice()); }
    }

    var first = merged[0][0];
    var start = Math.max(0, first - radius);
    var end = Math.min(text.length, start + SNIPPET_WINDOW);

    var html = (start > 0 ? '…' : '');
    var cursor = start;
    for (var m = 0; m < merged.length; m++) {
      var rs = merged[m][0], re = merged[m][1];
      if (re <= start || rs >= end) { continue; } // outside the window
      if (rs < cursor) { rs = cursor; }
      rs = Math.max(rs, start); re = Math.min(re, end);
      html += escapeHtml(text.slice(cursor, rs));
      html += '<mark>' + escapeHtml(text.slice(rs, re)) + '</mark>';
      cursor = re;
    }
    html += escapeHtml(text.slice(cursor, end));
    if (end < text.length) { html += '…'; }
    return html;
  }

  // #4: a single token that reads like a code identifier. Fuse's fuzzy matcher
  // mangles run-on identifiers, so for these queries we also do an exact pass.
  function looksLikeIdentifier(q) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(q) && q.length >= 3 && /[a-z]/.test(q);
  }

  // #4: index entries whose text contains q as a WHOLE WORD (case-insensitive),
  // wrapped as best-possible (score 0) results with no fuzzy match ranges. These
  // are guaranteed-relevant identifier/term hits (e.g. "bayesupdate", "Normal").
  // Whole-word — not any substring — so a query like "Normal" does NOT inject
  // every "normalize"/"normalization" block at score 0 and flood the ranking.
  // (If q can't form a word boundary, fall back to substring containment.)
  // `limit` caps the scan so it stays bounded on a large index; `wordRe` may be
  // supplied to reuse a regex already built for this query.
  // Named for its PRIMARY behavior (whole-word hits); substring is only the
  // no-word-boundary fallback.
  function exactWordHits(index, q, limit, wordRe) {
    if (wordRe === undefined) wordRe = wholeWordRegex(q);
    var lq = q.toLowerCase();
    var out = [];
    for (var i = 0; i < index.length; i++) {
      var text = index[i].text || '';
      var hit = wordRe ? wordRe.test(text) : text.toLowerCase().indexOf(lq) !== -1;
      if (hit) {
        out.push({ item: index[i], score: 0, matches: null });
        if (typeof limit === 'number' && out.length >= limit) break;
      }
    }
    return out;
  }

  // #3: literal matches are almost always what the user meant, so subtract from
  // their (lower-is-better) score to float them above fuzzy-only hits. ADDITIVE
  // (not multiplicative) so it composes on one scale with the table/demote tiers
  // AND still tiers a score-0 exact hit — a multiplier left every 0-scored hit
  // (Fuse perfect matches, all injected exactWordHits) tied at 0. Tiered by how
  // the query sits in the text:
  //   - whole word ("Normal" in "the Normal distribution")  -> -WHOLE_WORD_BONUS
  //   - substring  ("normal" inside "normalize")            -> -SUBSTRING_BONUS
  //   - fuzzy only                                          -> unchanged
  // The bonus gap (0.2) exceeds any single raw Fuse score, so a whole-word hit
  // outranks a substring hit regardless of their fuzzy baselines. Returns a new
  // array; inputs unmutated. `wordRe` may be supplied to reuse a regex already
  // built for this query.
  function boostExact(results, q, wordRe) {
    var lq = q.toLowerCase();
    if (wordRe === undefined) wordRe = wholeWordRegex(q);
    return results.map(function (r) {
      var text = r.item && r.item.text ? r.item.text : '';
      var s = typeof r.score === 'number' ? r.score : 1;
      var bonus = 0;
      if (wordRe && wordRe.test(text)) { bonus = WHOLE_WORD_BONUS; }
      else if (text.toLowerCase().indexOf(lq) !== -1) { bonus = SUBSTRING_BONUS; }
      return { item: r.item, score: s - bonus, matches: r.matches };
    });
  }

  // Boost matches that live in reference tables (distributions, functions,
  // modules, profile mappings). These cells are the canonical concise
  // definitions, so a table hit should outrank incidental prose. Additive
  // (subtract `bonus`) so it composes with the additive demote/jackpot tiers on
  // one scale — a multiplier (0 * f = 0) couldn't separate a near-zero exact
  // table cell from a tying prose mention. Pure; returns a new array.
  function boostTables(results, bonus) {
    if (typeof bonus !== 'number') bonus = TABLE_BONUS;
    return results.map(function (r) {
      var item = r.item || {};
      var s = typeof r.score === 'number' ? r.score : 1;
      return { item: r.item, score: item.isTable ? s - bonus : s, matches: r.matches };
    });
  }

  // #2: collapse every matching block under one section to ONE row, so the list
  // shows one result per section instead of a wall of blocks from the same place.
  // Sections are keyed by their heading's anchor id (`sectionId`) — NOT the
  // rendered heading-path text, so two distinct sections that happen to share an
  // identical path (e.g. repeated "Notes"/"Examples" subsections) stay separate.
  // Blocks with no section fall back to their own targetId (never merged).
  // First-seen order is preserved.
  //
  // Ranking and display are deliberately decoupled:
  //   - DISPLAY  the best-scoring *body* block (prose snippet that says why the
  //     section matched). Only if a section has no matching body block do we
  //     fall back to the heading block (then the bare title is all there is).
  //   - RANK     by the section's best score overall (heading or body).
  //
  // JACKPOT: if `query` is supplied and a section's heading TITLE literally
  // contains it (e.g. searching "likelihoods" with a "Likelihoods and
  // posteriors" heading), that section is tiered to the very top. The jackpot
  // offset is computed RELATIVE to the actual score extrema (min non-jackpot,
  // max jackpot base) so a jackpot always leads regardless of score scale,
  // sign, or threshold tuning. The displayed row is still the body prose, not
  // the bare title.
  function dedupeByHeading(results, query, headingWordRe) {
    // Jackpot only on a whole-word heading-title hit, so searching "normal"
    // jackpots a "Normal distribution" heading but not "Normalization".
    if (headingWordRe === undefined) headingWordRe = wholeWordRegex(query);
    function scoreOf(r) { return typeof r.score === 'number' ? r.score : 1; }

    var groups = {};
    var order = [];
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var item = r.item || {};
      var key = item.sectionId ? 's:' + item.sectionId
        : item.heading ? 'h:' + item.heading
        : 't:' + (item.targetId || i);
      var g = groups[key];
      if (!g) { g = groups[key] = { bestOverall: r, bestBody: null, exactHeading: false }; order.push(key); }
      if (scoreOf(r) < scoreOf(g.bestOverall)) g.bestOverall = r;
      if (item.isHeading) {
        if (headingWordRe && headingWordRe.test(item.text || '')) g.exactHeading = true;
      } else if (!g.bestBody || scoreOf(r) < scoreOf(g.bestBody)) {
        g.bestBody = r;
      }
    }

    // First pass: resolve display row, base rank, and whether each group wins
    // the jackpot. The jackpot can fire even when no isHeading block for the
    // section reached the result set — fall back to the heading path's last
    // segment so a body-only match still tiers correctly.
    var ranked = order.map(function (k) {
      var g = groups[k];
      var display = g.bestBody || g.bestOverall;
      var jackpot = g.exactHeading;
      if (!jackpot && headingWordRe) {
        var path = (display.item && display.item.heading) || '';
        var title = path.split(' - ').pop();
        if (title && headingWordRe.test(title)) jackpot = true;
      }
      return { item: display.item, base: scoreOf(g.bestOverall), jackpot: jackpot, matches: display.matches };
    });

    // Second pass: tier every jackpot strictly below every non-jackpot row.
    // The offset must clear BOTH the minimum non-jackpot score (the row a
    // jackpot has to beat) AND the maximum jackpot base (so even the
    // worst-scoring jackpot lands below it): max jackpot final =
    // maxJackpotBase - (maxJackpotBase - minNonJackpot + 1) = minNonJackpot - 1.
    // The old `maxNonJackpotBase + 1` was insufficient — a negative non-jackpot
    // score (e.g. an exact table cell at -0.25) or a large jackpot base could
    // leave a jackpot ranked above a non-jackpot. Subtracting one constant
    // preserves jackpots' relative order. No jackpots -> no offset; no
    // non-jackpots -> nothing to clear.
    var minNonJackpot = Infinity, maxJackpotBase = -Infinity;
    for (var j = 0; j < ranked.length; j++) {
      if (ranked[j].jackpot) { if (ranked[j].base > maxJackpotBase) maxJackpotBase = ranked[j].base; }
      else if (ranked[j].base < minNonJackpot) minNonJackpot = ranked[j].base;
    }
    var jackpotOffset = minNonJackpot === Infinity ? 0 : (maxJackpotBase - minNonJackpot + 1);
    return ranked.map(function (x) {
      return { item: x.item, score: x.jackpot ? x.base - jackpotOffset : x.base, matches: x.matches };
    });
  }

  // Push frontmatter/overview prose down so deeper reference sections win.
  // `prefixes` is a list of lowercased heading-path prefixes; a result whose
  // heading path starts with any of them has `penalty` ADDED to its
  // (lower-is-better) score. Additive (not multiplicative) so it reliably
  // worsens scores that may already be zero or negative after exact/table
  // boosts. Pure; returns a new array.
  function demoteByHeading(results, prefixes, penalty) {
    if (typeof penalty !== 'number' || penalty < 0) penalty = DEMOTE_PENALTY;
    prefixes = prefixes || [];
    return results.map(function (r) {
      var item = r.item || {};
      var h = (item.heading || '').toLowerCase();
      var demote = false;
      for (var i = 0; i < prefixes.length; i++) {
        if (prefixes[i] && h.indexOf(prefixes[i]) === 0) { demote = true; break; }
      }
      var s = typeof r.score === 'number' ? r.score : 1;
      return { item: r.item, score: demote ? s + penalty : s, matches: r.matches };
    });
  }

  // Build the search index entries from an ordered list of raw blocks. Pure: no
  // DOM. The DOM walk in docs-app.js gathers blocks (assigning anchor ids and
  // capping PRE text) and calls this; it then attaches each entry's `.el` by
  // index. This is the canonical producer of the SearchItem shape (see typedef).
  //
  // `blocks` is in document order, each: { id, text, isHeading, level, isTable }
  // (`level` is the 1-6 heading level, 0 for non-headings). Returns SearchItems
  // WITHOUT `.el`. A heading updates the heading stack BEFORE its own entry is
  // pushed, so a heading's sectionId is its own id and its body blocks inherit
  // it — grouping the section together while keeping same-titled sections (with
  // distinct ids) apart.
  function buildIndexEntries(blocks) {
    var stack = [null, null, null, null, null, null, null];
    function headingPath() {
      var parts = [];
      for (var i = 1; i <= 6; i++) { if (stack[i]) parts.push(stack[i].text); }
      return parts.join(' - ');
    }
    function sectionId() {
      for (var i = 6; i >= 1; i--) { if (stack[i] && stack[i].id) return stack[i].id; }
      return '';
    }
    var out = [];
    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b] || {};
      if (blk.isHeading) {
        var level = blk.level;
        stack[level] = {
          id: blk.id || '',
          // Normalize the heading text used for the path: drop trailing anchor
          // #(s), collapse whitespace, strip the leading section number. Keeps
          // paths readable and demote-prefix matching reliable even if a caller
          // passes raw heading text carrying the source's newlines/markers.
          text: String(blk.text == null ? '' : blk.text)
            .replace(/\s*#+\s*$/, '').replace(/\s+/g, ' ').replace(/^[\d.]+\s+/, '').trim()
        };
        for (var j = level + 1; j <= 6; j++) stack[j] = null;
      }
      out.push({
        text: blk.text,
        heading: headingPath(),
        sectionId: sectionId(),
        targetId: blk.id,
        isHeading: !!blk.isHeading,
        isTable: !!blk.isTable
      });
    }
    return out;
  }

  // Orchestrates a single search. Pure: takes an already-built `fuse` instance
  // and the `index` array, returns processed results ready to render
  // ({ item, score, matches }). `matches` is threaded through untouched and
  // retained for a potential future highlighter; the current renderer ignores
  // it (buildSnippet works from the raw query). Order of operations:
  //   sanitize -> fuse.search -> (identifier? merge exact hits)
  //   -> boostExact -> boostTables -> demoteByHeading -> dedupeByHeading
  //   -> sort by score -> cap to maxResults.
  // The whole-word regex is built once here and threaded into every stage.
  function computeResults(opts) {
    opts = opts || {};
    var fuse = opts.fuse;
    var index = opts.index || [];
    var maxResults = opts.maxResults != null ? opts.maxResults : 40;
    var q = sanitizeQuery(opts.rawQuery);
    if (!q) return [];
    var wordRe = wholeWordRegex(q);

    // Over-fetch before dedup so collapsing per section still fills the list.
    var raw = fuse.search(q, { limit: maxResults * 2 });

    if (looksLikeIdentifier(q)) {
      var seen = {};
      for (var i = 0; i < raw.length; i++) {
        if (raw[i].item) seen[raw[i].item.targetId] = true;
      }
      var extra = exactWordHits(index, q, maxResults * 2, wordRe).filter(function (r) {
        return !seen[r.item.targetId];
      });
      raw = extra.concat(raw);
    }

    // boostExact, boostTables and demoteByHeading are all ADDITIVE, so they
    // commute — their order among themselves does not change the result. The
    // ONE ordering invariant is that dedupeByHeading runs LAST: its jackpot
    // offset is computed relative to the other rows' final base scores.
    // (opts.tableBonus -> TABLE_BONUS; opts.demoteHeadings = lowercased
    // heading-path prefixes; opts.demotePenalty -> DEMOTE_PENALTY.)
    // Convention: per-search tunables (tableBonus, demotePenalty, demoteHeadings,
    // maxResults) are pass-through opts, each defaulted by its callee. The
    // text-shaping tunables (RADIUS, SNIPPET_WINDOW, MIN_TERM_LEN, the bonus
    // factors, threshold) are intentionally fixed module constants.
    var boosted = boostExact(raw, q, wordRe);
    boosted = boostTables(boosted, opts.tableBonus);
    boosted = demoteByHeading(boosted, opts.demoteHeadings || [], opts.demotePenalty);
    // Collapse to one row per section (body prose preferred for display).
    // Passing q enables the exact-heading jackpot (see dedupeByHeading).
    var deduped = dedupeByHeading(boosted, q, wordRe);
    deduped.sort(function (a, b) { return a.score - b.score; });
    return deduped.slice(0, maxResults);
  }

  return {
    __loaded: true,
    searchFuseOptions: searchFuseOptions,
    sanitizeQuery: sanitizeQuery,
    snippetTerms: snippetTerms,
    buildSnippet: buildSnippet,
    looksLikeIdentifier: looksLikeIdentifier,
    exactWordHits: exactWordHits,
    boostExact: boostExact,
    boostTables: boostTables,
    dedupeByHeading: dedupeByHeading,
    demoteByHeading: demoteByHeading,
    buildIndexEntries: buildIndexEntries,
    computeResults: computeResults
  };
});
