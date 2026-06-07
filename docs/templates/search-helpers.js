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

  return {
    __loaded: true,
    searchFuseOptions: searchFuseOptions,
    sanitizeQuery: sanitizeQuery
  };
});
