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
  // (0.5 - 0.1 = 0.4) strictly EXCEEDS the Fuse threshold 0.35 — the largest raw
  // score any returned hit can carry — so a whole-word hit outranks a substring
  // hit regardless of their fuzzy baselines (worst case: whole at score 0.35,
  // substring at 0.0 -> 0.35-0.5 = -0.15 < 0.0-0.1 = -0.1). (C2)
  var WHOLE_WORD_BONUS = 0.5;  // additive: whole-word literal match (strong)
  var SUBSTRING_BONUS = 0.1;   // additive: substring literal match (mild)
  var TABLE_BONUS = 0.25;       // reference-table cell lift (additive, better)
  var DEMOTE_PENALTY = 0.4;     // frontmatter/overview push-down (additive, worse)
  // ORDERING CONTRACT — the final ranking (see computeResults) is a TIERED sort:
  //   jackpot (heading-title literal hit) < exact (query is a whole word or
  //   substring of the block text) < fuzzy-only.
  // The additive bonuses/penalties below NEVER cross tiers — they only order
  // rows WITHIN a tier (whole word before substring; table cells lifted;
  // overview/abstract demoted). So an EXACT match always outranks any
  // fuzzy-only match, regardless of Fuse scores or any boost. Retune the
  // within-tier knobs as a set; whole-word > substring (gap 0.4) is the one
  // intra-tier magnitude relationship pinned by tests (gap 0.4 > threshold 0.35).

  // #1 (heading-weighted keys) + #5 (multi-word AND via extended search).
  // useExtendedSearch makes a space-separated query an AND of fuzzy tokens.
  var searchFuseOptions = {
    keys: [
      { name: 'text', weight: 0.7 },
      { name: 'heading', weight: 0.3 }
    ],
    includeScore: true,
    includeMatches: false,
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

  // Lower-is-better score with a default for results Fuse left unscored.
  function scoreOf(r) { return r && typeof r.score === 'number' ? r.score : 1; }

  // Precompile the snippet match regexes for a query ONCE so a caller rendering
  // many rows reuses them instead of recompiling per row (P2). No /u/ flag:
  // terms are escaped literals and UTF-16 offsets already line up with String
  // slicing, so /u/ buys nothing and would throw on invalid input like a lone
  // surrogate (C3). Each regex is global; buildSnippet resets lastIndex per use.
  function snippetRegexes(query, terms) {
    if (!Array.isArray(terms)) terms = snippetTerms(query);
    var out = [];
    for (var i = 0; i < terms.length; i++) {
      if (terms[i]) out.push(new RegExp(escapeRegExp(terms[i]), 'gi'));
    }
    return out;
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

  // Case-insensitive "term starts a word" matcher (left word boundary only), or
  // null if the query can't begin a word. Used to promote a word-PREFIX hit
  // ("normal" in "normalize") into the exact tier while leaving a MID-word hit
  // ("normal" in "abnormal") fuzzy-only, so common substrings don't flood the
  // tier (C4). Stateless (no /g/); shareable across a search.
  function wordPrefixRegex(q) {
    if (!q) return null;
    try {
      var WORD = '[\\p{L}\\p{N}_]';
      var edge = new RegExp(WORD, 'u');
      if (!edge.test(q.charAt(0))) return null; // query can't begin a word
      return new RegExp('(?<!' + WORD + ')' + escapeRegExp(q), 'iu');
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

    // Locate each term ON THE ORIGINAL-CASE text with an index-preserving,
    // case-insensitive regex. Indexing into a separately-lowercased copy is a
    // bug: length-changing code points (e.g. "İ" U+0130 -> "i̇" under
    // toLowerCase) shift every later offset, so ranges computed on the lowercase
    // string would mis-slice the original text. match.index/lastIndex from a
    // scan over the real text are always correct, whatever case folding does.
    var ranges = [];
    for (var t = 0; t < terms.length; t++) {
      var term = terms[t];
      if (!term) continue;
      // `term` may be a precompiled /gi/ RegExp (caller used snippetRegexes to
      // compile once per search) or a string to compile here. No /u/ flag — see
      // snippetRegexes. Reset lastIndex so a reused global regex scans from 0.
      var re = term instanceof RegExp ? term : new RegExp(escapeRegExp(term), 'gi');
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(text)) !== null) {
        ranges.push([m.index, m.index + m[0].length]);
        if (m.index === re.lastIndex) re.lastIndex++; // guard against any zero-length match
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

    // Anchor on the DENSEST cluster: the merged-range whose SNIPPET_WINDOW-wide
    // span starting at it covers the most ranges. This surfaces the part of the
    // block where the query terms actually co-occur instead of an early lone
    // term (C5). Ties resolve to the earliest cluster (strict >). A term still
    // outside the chosen window is intentionally not highlighted (bounded
    // snippet) — see the L3 test.
    var anchorIdx = 0, bestCount = 0;
    for (var c = 0; c < merged.length; c++) {
      var winEnd = merged[c][0] + SNIPPET_WINDOW;
      var count = 0;
      for (var d = c; d < merged.length && merged[d][0] < winEnd; d++) count++;
      if (count > bestCount) { bestCount = count; anchorIdx = c; }
    }
    var first = merged[anchorIdx][0];
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
    // Per-keystroke this scans the index once, but only for identifier-shaped
    // queries (see looksLikeIdentifier in computeResults) and it stops at
    // `limit` (callers pass maxResults*2), so the work stays bounded — no
    // debounce needed at the docs' index size.
    for (var i = 0; i < index.length; i++) {
      var text = index[i].text || '';
      var hit = wordRe ? wordRe.test(text) : text.toLowerCase().indexOf(lq) !== -1;
      if (hit) {
        out.push({ item: index[i], score: 0 });
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
  //   - whole word  ("Normal" in "the Normal distribution") -> -WHOLE_WORD_BONUS
  //   - word prefix ("normal" starting "normalize")         -> -SUBSTRING_BONUS
  //   - mid-word / fuzzy only ("normal" in "abnormal")      -> unchanged (C4)
  // The bonus gap (0.4) exceeds the Fuse threshold (0.35) — the max score any
  // hit can carry — so a whole-word hit outranks a substring hit regardless of
  // their fuzzy baselines. Returns a new
  // array; inputs unmutated. `wordRe` may be supplied to reuse a regex already
  // built for this query.
  function boostExact(results, q, wordRe, prefixRe) {
    if (wordRe === undefined) wordRe = wholeWordRegex(q);
    // Substring promotion is limited to WORD-PREFIX hits so mid-word matches
    // ("normal" in "abnormal") don't flood the exact tier (C4). If the query
    // can't start a word, prefixRe is null and only whole-word hits promote.
    if (prefixRe === undefined) prefixRe = wordPrefixRegex(q);
    return results.map(function (r) {
      var text = r.item && r.item.text ? r.item.text : '';
      var s = scoreOf(r);
      var whole = !!(wordRe && wordRe.test(text));
      var sub = !whole && !!(prefixRe && prefixRe.test(text));
      var bonus = whole ? WHOLE_WORD_BONUS : (sub ? SUBSTRING_BONUS : 0);
      // `exact` tags the result for the tiered sort in computeResults: an exact
      // (whole-word or substring) hit always outranks a fuzzy-only hit, no
      // matter the scores. The score still orders rows within the exact tier.
      return { item: r.item, score: s - bonus, exact: whole || sub };
    });
  }

  // Boost matches that live in reference tables (distributions, functions,
  // modules, profile mappings). These cells are the canonical concise
  // definitions, so a table hit should outrank incidental prose. Additive
  // (subtract `bonus`) so it composes with the additive demote tier on one
  // scale. ONLY lifts a cell that is itself an EXACT match (r.exact, set by the
  // preceding boostExact) — a fuzzy-only cell ("Distribution" for the query
  // "distributed") is not a real hit, so promoting it would float it (and its
  // section's display row) above genuine content. Pure; returns a new array.
  function boostTables(results, bonus) {
    if (typeof bonus !== 'number') bonus = TABLE_BONUS;
    return results.map(function (r) {
      var item = r.item || {};
      var s = scoreOf(r);
      return Object.assign({}, r, { score: (item.isTable && r.exact) ? s - bonus : s });
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
  // posteriors" heading), the group is flagged `jackpot` and computeResults
  // sorts it into the top tier. The displayed row is still the body prose, not
  // the bare title. Each group is also flagged `exact` if any of its blocks is
  // an exact (whole-word/substring) hit, so computeResults can tier it above
  // fuzzy-only sections. dedupeByHeading itself does NOT sort or offset scores —
  // it only collapses and flags; the tiered sort lives in computeResults.
  // A section flagged `demoted` (by demoteByHeading, via a demote-prefix match)
  // is never jackpotted — the demote would otherwise be defeated by the top
  // tier. The group's `demoted` flag is carried onto the collapsed row. (C1)
  function dedupeByHeading(results, query, headingWordRe) {
    // Jackpot only on a whole-word heading-title hit, so searching "normal"
    // jackpots a "Normal distribution" heading but not "Normalization".
    if (headingWordRe === undefined) headingWordRe = wholeWordRegex(query);

    var groups = {};
    var order = [];
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var item = r.item || {};
      var key = item.sectionId ? 's:' + item.sectionId
        : item.heading ? 'h:' + item.heading
        : 't:' + (item.targetId || i);
      var g = groups[key];
      if (!g) { g = groups[key] = { bestOverall: r, bestBody: null, exactHeading: false, exact: false, demoted: false }; order.push(key); }
      if (scoreOf(r) < scoreOf(g.bestOverall)) g.bestOverall = r;
      if (r.exact) g.exact = true;
      if (r.demoted) g.demoted = true;
      if (item.isHeading) {
        if (headingWordRe && headingWordRe.test(item.text || '')) g.exactHeading = true;
      } else if (!g.bestBody || scoreOf(r) < scoreOf(g.bestBody)) {
        g.bestBody = r;
      }
    }

    // Collapse to one row per group: display the best body block (prose), rank
    // by the group's best score, and flag jackpot/exact for the tiered sort in
    // computeResults. The jackpot can fire even when no isHeading block reached
    // the result set — fall back to the heading path's last segment so a
    // body-only match still tiers correctly. No score offset is applied here.
    return order.map(function (k) {
      var g = groups[k];
      var display = g.bestBody || g.bestOverall;
      var jackpot = g.exactHeading;
      if (!jackpot && headingWordRe) {
        var path = (display.item && display.item.heading) || '';
        var title = path.split(' - ').pop();
        if (title && headingWordRe.test(title)) jackpot = true;
      }
      // A demoted section must never enter the jackpot tier, or the demote (a
      // within-tier penalty) is silently overridden by the top tier. (C1)
      if (g.demoted) jackpot = false;
      return { item: display.item, score: scoreOf(g.bestOverall), jackpot: jackpot, exact: g.exact, demoted: g.demoted };
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
      var demote = prefixes.some(function (p) { return p && h.indexOf(p) === 0; });
      var s = scoreOf(r);
      // Carry a `demoted` flag so dedupeByHeading can refuse to jackpot a demoted
      // section (otherwise the jackpot tier overrides the demote). (C1)
      return Object.assign({}, r, { score: demote ? s + penalty : s, demoted: demote });
    });
  }

  // Canonical heading-text cleaner — the SINGLE source of truth for turning raw
  // rendered heading text into the form used in heading paths and heading-row
  // snippets. Drops a trailing anchor #(s), collapses internal whitespace
  // (newlines/indentation from the source), and strips a leading section number
  // (e.g. "6.4 "). Used by buildIndexEntries and exported so docs-app.js can
  // apply the exact same normalization without re-copying the regex chain.
  function normalizeHeadingText(s) {
    return String(s == null ? '' : s)
      // Collapse newlines/indentation to single spaces and trim FIRST, so a
      // leading section number that was preceded by source whitespace still sits
      // at index 0 for the next strip (raw el.textContent may carry indentation).
      .replace(/\s+/g, ' ').trim()
      // Drop the leading section number ("6.4 "), then the trailing anchor #(s)
      // (one-or-more, e.g. a section-number '#' plus the html-anchor '#').
      .replace(/^[\d.]+\s+/, '').replace(/\s*#+\s*$/, '').trim();
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
    // stack is length-7; indices 1-6 are the meaningful heading levels.
    function headingPath() {
      return stack.slice(1).filter(Boolean).map(function (h) { return h.text; }).join(' - ');
    }
    function sectionId() {
      var h = stack.slice(1).reverse().find(function (x) { return x && x.id; });
      return h ? h.id : '';
    }
    var out = [];
    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b] || {};
      if (blk.isHeading) {
        var level = blk.level;
        // Normalize the heading text used for the path (single source of truth:
        // see normalizeHeadingText) so paths read well and demote-prefix matching
        // stays reliable even when a caller passes raw heading text carrying the
        // source's section number, newlines/indentation, or trailing anchor #(s).
        stack[level] = { id: blk.id || '', text: normalizeHeadingText(blk.text) };
        for (var j = level + 1; j <= 6; j++) stack[j] = null;
      }
      out.push({
        // A heading row stores its NORMALIZED title so the snippet matches the
        // clean heading-path span (no leading section number / trailing #).
        // Body blocks keep their raw text for snippet context.
        text: blk.isHeading ? normalizeHeadingText(blk.text) : blk.text,
        heading: headingPath(),
        sectionId: sectionId(),
        targetId: blk.id,
        isHeading: !!blk.isHeading,
        isTable: !!blk.isTable
      });
    }
    return out;
  }

  // Attach each live DOM node onto its index entry by position. docs-app.js
  // builds `index` from buildIndexEntries (one entry per gathered block, in
  // order) and `els` from the same DOM walk, so the two arrays are parallel.
  // If they ever disagree in length the contract is broken — return an empty
  // index so search degrades to "unavailable" rather than scrolling results to
  // the wrong element. Mutates `index` in place and returns it (or [] on a
  // mismatch / non-array input).
  function attachElements(index, els) {
    if (!Array.isArray(index) || !Array.isArray(els) || index.length !== els.length) return [];
    for (var i = 0; i < index.length; i++) { index[i].el = els[i]; }
    return index;
  }

  // Orchestrates a single search. Pure: takes an already-built `fuse` instance
  // and the `index` array, returns processed results ready to render
  // ({ item, score }). Fuse's per-character `matches` are intentionally dropped
  // at boostExact — no renderer consumes them; buildSnippet highlights from the
  // raw query instead. Order of operations:
  //   sanitize -> fuse.search -> (identifier? merge exact hits)
  //   -> boostExact -> boostTables -> demoteByHeading -> dedupeByHeading
  //   -> tiered sort (jackpot < exact < fuzzy, score as tiebreak) -> cap.
  // The whole-word regex is built once here and threaded into every stage.
  function computeResults(opts) {
    opts = opts || {};
    var fuse = opts.fuse;
    var index = opts.index || [];
    var maxResults = opts.maxResults != null ? opts.maxResults : 40;
    var q = sanitizeQuery(opts.rawQuery);
    if (!q) return [];
    var wordRe = wholeWordRegex(q);
    var prefixRe = wordPrefixRegex(q);

    // Over-fetch before dedup so collapsing per section still fills the list.
    var raw = fuse.search(q, { limit: maxResults * 2 });

    if (looksLikeIdentifier(q)) {
      // Set keyed on targetId (not a plain object) so an id like "__proto__"
      // can't collide with Object.prototype keys.
      var seen = new Set(raw.map(function (r) { return r.item && r.item.targetId; }));
      var extra = exactWordHits(index, q, maxResults * 2, wordRe).filter(function (r) {
        return !seen.has(r.item.targetId);
      });
      raw = extra.concat(raw);
    }

    // boostExact runs FIRST: it tags each row `exact` and applies the literal
    // bonus. boostTables then lifts ONLY exact table cells (it reads that flag),
    // and demoteByHeading penalizes overview prose; those two are additive and
    // commute with each other. dedupeByHeading runs LAST, collapsing sections
    // and flagging jackpot/exact for the tiered sort.
    // (opts.tableBonus -> TABLE_BONUS; opts.demoteHeadings = lowercased
    // heading-path prefixes; opts.demotePenalty -> DEMOTE_PENALTY.)
    // Convention: per-search tunables (tableBonus, demotePenalty, demoteHeadings,
    // maxResults) are pass-through opts, each defaulted by its callee. The
    // text-shaping tunables (RADIUS, SNIPPET_WINDOW, MIN_TERM_LEN, the bonus
    // factors, threshold) are intentionally fixed module constants.
    var boosted = boostExact(raw, q, wordRe, prefixRe);
    boosted = boostTables(boosted, opts.tableBonus);
    boosted = demoteByHeading(boosted, opts.demoteHeadings || [], opts.demotePenalty);
    // Collapse to one row per section (body prose preferred for display).
    // Passing q enables the exact-heading jackpot (see dedupeByHeading).
    var deduped = dedupeByHeading(boosted, q, wordRe);
    // Tiered sort: jackpot (0) < exact (1) < fuzzy-only (2); score breaks ties
    // within a tier. This is what guarantees an exact match always outranks a
    // fuzzy-only one — no boost can move a row across tiers.
    function tier(r) { return r.jackpot ? 0 : (r.exact ? 1 : 2); }
    // Stamp first-seen order (dedupeByHeading preserves it) as an explicit final
    // tiebreaker so the ranking is deterministic without relying on Array.sort
    // being stable. `_ord` is internal; the renderer reads only item/score.
    for (var oi = 0; oi < deduped.length; oi++) { deduped[oi]._ord = oi; }
    deduped.sort(function (a, b) { return (tier(a) - tier(b)) || (a.score - b.score) || (a._ord - b._ord); });
    return deduped.slice(0, maxResults);
  }

  return {
    __loaded: true,
    searchFuseOptions: searchFuseOptions,
    sanitizeQuery: sanitizeQuery,
    snippetTerms: snippetTerms,
    snippetRegexes: snippetRegexes,
    buildSnippet: buildSnippet,
    looksLikeIdentifier: looksLikeIdentifier,
    exactWordHits: exactWordHits,
    boostExact: boostExact,
    boostTables: boostTables,
    dedupeByHeading: dedupeByHeading,
    demoteByHeading: demoteByHeading,
    normalizeHeadingText: normalizeHeadingText,
    buildIndexEntries: buildIndexEntries,
    attachElements: attachElements,
    computeResults: computeResults
  };
});
