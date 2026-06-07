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
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.SearchHelpers = api; }
})(this, function () {
  'use strict';

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

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Case-insensitive whole-word matcher for a query, or null if the query can't
  // form a word boundary (e.g. starts/ends with punctuation). Used to rank a
  // whole-word hit ("Normal") above the same letters inside a longer word
  // ("normalize").
  function wholeWordRegex(q) {
    if (!q) return null;
    try {
      var re = new RegExp('\\b' + escapeRegExp(q) + '\\b', 'i');
      // \b only anchors next to a word char; if the query edge isn't a word
      // char the regex can't mean "whole word", so don't use it.
      return /[A-Za-z0-9_]/.test(q.charAt(0)) && /[A-Za-z0-9_]/.test(q.charAt(q.length - 1)) ? re : null;
    } catch (e) { return null; }
  }

  // Clean, term-based snippet highlighter. Highlights the user's actual query
  // terms (case-insensitive whole substrings) rather than Fuse's per-character
  // fuzzy indices, which scatter staccato single-letter <mark>s across the text.
  // Builds a ~200-char window anchored on the first matched term and returns
  // escaped HTML with <mark> spans and … ellipses. If no term occurs literally,
  // returns the head of the text (still useful context). Original case is kept.
  function buildSnippet(text, query, radius) {
    text = text == null ? '' : String(text);
    if (typeof radius !== 'number') radius = 60;
    var WINDOW = 200;
    var terms = sanitizeQuery(query).toLowerCase().split(' ').filter(function (t) { return t.length >= 2; });
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
      var head = escapeHtml(text.slice(0, 140));
      return text.length > 140 ? head + '…' : head;
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
    var end = Math.min(text.length, start + WINDOW);

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
  function exactSubstringHits(index, q) {
    var wordRe = wholeWordRegex(q);
    var lq = q.toLowerCase();
    var out = [];
    for (var i = 0; i < index.length; i++) {
      var text = index[i].text || '';
      var hit = wordRe ? wordRe.test(text) : text.toLowerCase().indexOf(lq) !== -1;
      if (hit) { out.push({ item: index[i], score: 0, matches: null }); }
    }
    return out;
  }

  // #3: literal matches are almost always what the user meant, so multiply their
  // (lower-is-better) score to float them above fuzzy-only hits. Tiered by how
  // the query sits in the text:
  //   - whole word ("Normal" in "the Normal distribution")  -> x0.25 (strong)
  //   - substring  ("normal" inside "normalize")            -> x0.6  (mild)
  //   - fuzzy only                                          -> unchanged
  // This keeps "Normal" (the distribution) above "normalize" while still giving
  // prefix/substring queries some lift. Returns a new array; inputs unmutated.
  function boostExact(results, q) {
    var lq = q.toLowerCase();
    var wordRe = wholeWordRegex(q);
    return results.map(function (r) {
      var text = r.item && r.item.text ? r.item.text : '';
      var s = typeof r.score === 'number' ? r.score : 1;
      var factor = 1;
      if (wordRe && wordRe.test(text)) { factor = 0.25; }
      else if (text.toLowerCase().indexOf(lq) !== -1) { factor = 0.6; }
      return { item: r.item, score: s * factor, matches: r.matches };
    });
  }

  // Boost matches that live in reference tables (distributions, functions,
  // modules, profile mappings). These cells are the canonical concise
  // definitions, so a table hit should outrank incidental prose. This is an
  // additive tier (subtract `bonus`), not a multiplier, because exact short
  // matches already score ~0 and a multiplier (0 * f = 0) couldn't separate a
  // table cell from a tying prose mention. Tiers below the heading jackpot
  // (-1) but above ordinary prose. Pure; returns a new array.
  function boostTables(results, bonus) {
    if (typeof bonus !== 'number') bonus = 0.25;
    return results.map(function (r) {
      var item = r.item || {};
      var s = typeof r.score === 'number' ? r.score : 1;
      return { item: r.item, score: item.isTable ? s - bonus : s, matches: r.matches };
    });
  }

  // #2: collapse every matching block under one heading to ONE row, so the list
  // shows one result per section instead of a wall of blocks from the same place.
  // Blocks with no heading fall back to their own targetId (never merged).
  // First-seen heading order is preserved.
  //
  // Ranking and display are deliberately decoupled:
  //   - DISPLAY  the best-scoring *body* block (prose snippet that says why the
  //     section matched). Only if a section has no matching body block do we
  //     fall back to the heading block (then the bare title is all there is).
  //   - RANK     by the section's best score overall (heading or body).
  //
  // JACKPOT: if `query` is supplied and a section's heading TITLE literally
  // contains it (e.g. searching "likelihoods" with a "Likelihoods and
  // posteriors" heading), that section is tiered to the very top (rank pushed
  // below zero). The displayed row is still the body prose, not the bare title.
  function dedupeByHeading(results, query) {
    // Jackpot only on a whole-word heading-title hit, so searching "normal"
    // jackpots a "Normal distribution" heading but not "Normalization".
    var headingWordRe = wholeWordRegex(query);
    function scoreOf(r) { return typeof r.score === 'number' ? r.score : 1; }

    var groups = {};
    var order = [];
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var item = r.item || {};
      var key = item.heading ? 'h:' + item.heading : 't:' + (item.targetId || i);
      var g = groups[key];
      if (!g) { g = groups[key] = { bestOverall: r, bestBody: null, exactHeading: false }; order.push(key); }
      if (scoreOf(r) < scoreOf(g.bestOverall)) g.bestOverall = r;
      if (item.isHeading) {
        if (headingWordRe && headingWordRe.test(item.text || '')) g.exactHeading = true;
      } else if (!g.bestBody || scoreOf(r) < scoreOf(g.bestBody)) {
        g.bestBody = r;
      }
    }

    return order.map(function (k) {
      var g = groups[k];
      var display = g.bestBody || g.bestOverall;
      var rank = scoreOf(g.bestOverall);
      if (g.exactHeading) rank -= 1; // jackpot tier: always above non-jackpot rows
      return { item: display.item, score: rank, matches: display.matches };
    });
  }

  // Push frontmatter/overview prose down so deeper reference sections win.
  // `prefixes` is a list of lowercased heading-path prefixes; a result whose
  // heading path starts with any of them has its (lower-is-better) score
  // multiplied by `factor` (> 1 = worse). Pure; returns a new array.
  function demoteByHeading(results, prefixes, factor) {
    if (typeof factor !== 'number' || factor <= 0) factor = 1;
    prefixes = prefixes || [];
    return results.map(function (r) {
      var item = r.item || {};
      var h = (item.heading || '').toLowerCase();
      var demote = false;
      for (var i = 0; i < prefixes.length; i++) {
        if (prefixes[i] && h.indexOf(prefixes[i]) === 0) { demote = true; break; }
      }
      var s = typeof r.score === 'number' ? r.score : 1;
      return { item: r.item, score: demote ? s * factor : s, matches: r.matches };
    });
  }

  // Orchestrates a single search. Pure: takes an already-built `fuse` instance
  // and the `index` array, returns processed results ready to render
  // ({ item, score, matches }). Order of operations:
  //   sanitize -> fuse.search -> (identifier? merge exact hits) -> boost exact
  //   -> dedupe by heading -> sort by score -> cap to maxResults.
  function computeResults(opts) {
    opts = opts || {};
    var fuse = opts.fuse;
    var index = opts.index || [];
    var maxResults = opts.maxResults || 40;
    var q = sanitizeQuery(opts.rawQuery);
    if (!q) return [];

    // Over-fetch before dedup so collapsing per heading still fills the list.
    var raw = fuse.search(q, { limit: maxResults * 2 });

    if (looksLikeIdentifier(q)) {
      var seen = {};
      for (var i = 0; i < raw.length; i++) {
        if (raw[i].item) seen[raw[i].item.targetId] = true;
      }
      var extra = exactSubstringHits(index, q).filter(function (r) {
        return !seen[r.item.targetId];
      });
      raw = extra.concat(raw);
    }

    var boosted = boostExact(raw, q);
    // Push frontmatter/overview prose down (opts.demoteHeadings = lowercased
    // heading-path prefixes; opts.demoteFactor defaults to 1.6).
    boosted = demoteByHeading(boosted, opts.demoteHeadings || [], opts.demoteFactor || 1.6);
    // Lift reference-table cells above tying prose (opts.tableBonus default 0.25).
    boosted = boostTables(boosted, opts.tableBonus);
    // Collapse to one row per section (body prose preferred for display).
    // Passing q enables the exact-heading jackpot (see dedupeByHeading).
    var deduped = dedupeByHeading(boosted, q);
    deduped.sort(function (a, b) { return a.score - b.score; });
    return deduped.slice(0, maxResults);
  }

  return {
    __loaded: true,
    searchFuseOptions: searchFuseOptions,
    sanitizeQuery: sanitizeQuery,
    buildSnippet: buildSnippet,
    looksLikeIdentifier: looksLikeIdentifier,
    exactSubstringHits: exactSubstringHits,
    boostExact: boostExact,
    boostTables: boostTables,
    dedupeByHeading: dedupeByHeading,
    demoteByHeading: demoteByHeading,
    computeResults: computeResults
  };
});
