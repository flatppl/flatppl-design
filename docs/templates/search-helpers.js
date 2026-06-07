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
  // surprising operator behavior. Per-token: drop leading !^'= and trailing $,
  // drop a standalone | (OR), collapse whitespace.
  function sanitizeQuery(raw) {
    if (!raw) return '';
    return String(raw)
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(function (t) { return t.replace(/^[!^'=]+/, '').replace(/\$+$/, ''); })
      .filter(function (t) { return t && t !== '|'; })
      .join(' ');
  }

  // #4: a single token that reads like a code identifier. Fuse's fuzzy matcher
  // mangles run-on identifiers, so for these queries we also do an exact pass.
  function looksLikeIdentifier(q) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(q) && q.length >= 3 && /[a-z]/.test(q);
  }

  // #4: index entries whose text literally contains q (case-insensitive),
  // wrapped as best-possible (score 0) results with no fuzzy match ranges.
  function exactSubstringHits(index, q) {
    var lq = q.toLowerCase();
    var out = [];
    for (var i = 0; i < index.length; i++) {
      if (index[i].text.toLowerCase().indexOf(lq) !== -1) {
        out.push({ item: index[i], score: 0, matches: null });
      }
    }
    return out;
  }

  // #3: literal substring matches are almost always what the user meant, so
  // multiply their (lower-is-better) score by 0.3 to float them above
  // fuzzy-only hits. Returns a new array; inputs are not mutated.
  function boostExact(results, q) {
    var lq = q.toLowerCase();
    return results.map(function (r) {
      var text = r.item && r.item.text ? r.item.text : '';
      var hit = text.toLowerCase().indexOf(lq) !== -1;
      var s = typeof r.score === 'number' ? r.score : 1;
      return { item: r.item, score: hit ? s * 0.3 : s, matches: r.matches };
    });
  }

  return {
    __loaded: true,
    searchFuseOptions: searchFuseOptions,
    sanitizeQuery: sanitizeQuery,
    looksLikeIdentifier: looksLikeIdentifier,
    exactSubstringHits: exactSubstringHits,
    boostExact: boostExact
  };
});
