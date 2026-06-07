// Build sidebar nav from section headings, with expandable subsections
(function () {
  var nav = document.getElementById('sidebar-nav');

  // Collect top-level sections (h1 with single-number data-number)
  var sections = document.querySelectorAll('#content h1[data-number]');
  var sectionItems = []; // {li, id, subIds}

  sections.forEach(function (h) {
    if (!h.id) return;
    var num = h.getAttribute('data-number');
    if (num.indexOf('.') !== -1) return;

    var li = document.createElement('li');
    var a = document.createElement('a');
    // Strip trailing '#' injected by html-anchors.lua at build time
    a.textContent = h.textContent.replace(/^[\d.]+\s+/, '').replace(/\s*#$/, '').trim();
    a.href = '#' + h.id;
    li.appendChild(a);

    // Find subsections (h2 with data-number starting with this section's number + ".")
    var prefix = num + '.';
    var subHeadings = document.querySelectorAll('#content h2[data-number]');
    var subUl = null;
    var subIds = [];
    var subLinks = [];
    subHeadings.forEach(function (sh) {
      var snum = sh.getAttribute('data-number');
      if (!sh.id || !snum || !snum.startsWith(prefix)) return;
      // Only direct children (e.g. "2.1" not "2.1.1")
      var rest = snum.slice(prefix.length);
      if (rest.indexOf('.') !== -1) return;
      if (!subUl) {
        subUl = document.createElement('ul');
        subUl.className = 'sidebar-subsections';
      }
      var sli = document.createElement('li');
      var sa = document.createElement('a');
      sa.textContent = sh.textContent.replace(/^[\d.]+\s+/, '').replace(/\s*#$/, '').trim();
      sa.href = '#' + sh.id;
      sli.appendChild(sa);
      subUl.appendChild(sli);
      subIds.push(sh.id);
      subLinks.push({ id: sh.id, link: sa });
    });
    if (subUl) li.appendChild(subUl);

    nav.appendChild(li);
    sectionItems.push({ li: li, id: h.id, subIds: subIds, link: a, subLinks: subLinks });
  });

  // Cache element refs once — no getElementById on every scroll tick
  var allEls = [];
  sectionItems.forEach(function (s) {
    var el = document.getElementById(s.id);
    if (el) allEls.push({ id: s.id, el: el });
    s.subIds.forEach(function (sid) {
      var subEl = document.getElementById(sid);
      if (subEl) allEls.push({ id: sid, el: subEl });
    });
  });

  // Scroll spy via IntersectionObserver. rootMargin '-80px 0px 0px 0px'
  // shifts the trigger line 80px below the viewport top: a heading is in
  // `passed` once its top has crossed above that line. The observer is the
  // trigger; `passed` is rebuilt from live positions on each callback (see
  // below). Avoids polling on every scroll tick (layout thrash on long
  // docs) and adapts automatically to resize, font load, theme change,
  // sidebar collapse.
  var passed = new Set();
  var lastActive = '';

  function applyActive(current) {
    var changed = current && current !== lastActive;
    if (changed) {
      history.replaceState(null, '', '#' + current);
      lastActive = current;
    }

    sectionItems.forEach(function (s) {
      var isActive = current === s.id || s.subIds.indexOf(current) !== -1;

      s.li.classList.toggle('expanded', isActive);

      s.link.classList.toggle('active', isActive);
      if (isActive) {
        s.link.setAttribute('aria-current', 'location');
        if (changed) s.link.scrollIntoView({ block: 'nearest' });
      } else { s.link.removeAttribute('aria-current'); }

      for (var k = 0; k < s.subLinks.length; k++) {
        var sl = s.subLinks[k];
        var subActive = sl.id === current;
        sl.link.classList.toggle('active', subActive);
        if (subActive) { sl.link.setAttribute('aria-current', 'location'); }
        else { sl.link.removeAttribute('aria-current'); }
      }
    });
  }

  function recomputeActive() {
    var current = '';
    for (var i = 0; i < allEls.length; i++) {
      if (passed.has(allEls[i].id)) current = allEls[i].id;
    }
    applyActive(current);
  }

  var io = new IntersectionObserver(function () {
    // Rebuild `passed` from each heading's current position rather than
    // patching the fired entries. An anchor-jump (clicking a sidebar
    // link) moves scroll discontinuously: headings that leap from below
    // the viewport to above it never cross a threshold, so IO fires no
    // entry for them and incremental updates desync. A jump always pushes
    // previously-visible content out of view, firing at least one entry,
    // so this full resync runs. Layout reads happen only on crossing
    // events (rare), not every scroll tick.
    passed.clear();
    for (var i = 0; i < allEls.length; i++) {
      if (allEls[i].el.getBoundingClientRect().top < 80) passed.add(allEls[i].id);
    }
    recomputeActive();
  }, { rootMargin: '-80px 0px 0px 0px', threshold: [0, 1] });

  allEls.forEach(function (item) { io.observe(item.el); });

  // Sidebar toggle (mobile hamburger / wide-screen reopen)
  var toggle = document.getElementById('sidebar-toggle');
  var sidebar = document.getElementById('sidebar');
  var collapseBtn = document.getElementById('sidebar-collapse');
  var backdrop = document.getElementById('sidebar-backdrop');
  var mobileMediaQuery = window.matchMedia('(max-width: 60em)');
  toggle.setAttribute('aria-controls', 'sidebar');
  toggle.setAttribute('aria-expanded', 'false');

  function updateSidebarInert() {
    var narrow = mobileMediaQuery.matches;
    var hidden = narrow
      ? !sidebar.classList.contains('open')
      : document.body.classList.contains('sidebar-hidden');
    if (hidden) { sidebar.setAttribute('inert', ''); }
    else { sidebar.removeAttribute('inert'); }
  }

  function saveSidebarState(hidden) {
    try {
      if (hidden) { localStorage.setItem('sidebar-hidden', '1'); }
      else { localStorage.removeItem('sidebar-hidden'); }
    } catch (e) { }
  }

  // Mobile: toggle open/close; Wide: always opens (collapse btn handles closing)
  toggle.addEventListener('click', function () {
    if (mobileMediaQuery.matches) {
      var isOpen = sidebar.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    } else {
      document.body.classList.remove('sidebar-hidden');
      toggle.setAttribute('aria-expanded', 'true');
      saveSidebarState(false);
    }
    updateSidebarInert();
  });

  // Wide-screen collapse button (lives inside sidebar)
  collapseBtn.addEventListener('click', function () {
    document.body.classList.add('sidebar-hidden');
    toggle.setAttribute('aria-expanded', 'false');
    collapseBtn.setAttribute('aria-expanded', 'false');
    saveSidebarState(true);
    updateSidebarInert();
  });

  // Backdrop tap closes sidebar on mobile
  backdrop.addEventListener('click', function () {
    sidebar.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    updateSidebarInert();
  });

  // Only close on actual link clicks — keeps future expand carets / disclosure
  // controls inside the nav from inadvertently dismissing the mobile sidebar.
  nav.addEventListener('click', function (e) {
    if (!e.target.closest('a')) return;
    sidebar.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    updateSidebarInert();
  });
  mobileMediaQuery.addEventListener('change', function (e) {
    if (e.matches) {
      document.body.classList.remove('sidebar-hidden');
      toggle.setAttribute('aria-expanded', sidebar.classList.contains('open') ? 'true' : 'false');
    } else {
      sidebar.classList.remove('open');
      toggle.setAttribute('aria-expanded', document.body.classList.contains('sidebar-hidden') ? 'false' : 'true');
    }
    updateSidebarInert();
  });

  // Restore persisted sidebar collapse (wide screen only)
  try {
    if (!mobileMediaQuery.matches && localStorage.getItem('sidebar-hidden') === '1') {
      document.body.classList.add('sidebar-hidden');
      toggle.setAttribute('aria-expanded', 'false');
      collapseBtn.setAttribute('aria-expanded', 'false');
    }
  } catch (e) { }

  updateSidebarInert();

  // Theme toggle
  var themeToggle = document.getElementById('theme-toggle');
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  // localStorage may be unavailable (opaque origins, private-mode restrictions, etc.)
  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { }
  }

  function applyThemeUI(theme) {
    themeToggle.textContent = theme === 'dark' ? 'Light' : 'Dark';
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function setTheme(theme, save) {
    document.documentElement.setAttribute('data-theme', theme);
    if (save) { storageSet('theme', theme); }
    applyThemeUI(theme);
  }

  // data-theme already set by theme-init.js; sync button UI
  var initialTheme = document.documentElement.getAttribute('data-theme') || 'light';
  applyThemeUI(initialTheme);

  // Track system preference changes (only when user has no saved preference)
  mq.addEventListener('change', function (e) {
    if (!storageGet('theme')) {
      setTheme(e.matches ? 'dark' : 'light', false);
    }
  });

  themeToggle.addEventListener('click', function () {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(current === 'light' ? 'dark' : 'light', true);
  });

  // Full-text search. Index content blocks once on load; open a centred
  // dialog on demand so the main nav is never displaced.
  var searchTrigger = document.getElementById('sidebar-search-trigger');
  var searchDialog = document.getElementById('search-dialog');
  var searchInput = document.getElementById('search-dialog-input');
  var resultsList = document.getElementById('search-dialog-results');
  var emptyMsg = document.getElementById('search-dialog-empty');
  var searchStatus = document.getElementById('search-dialog-status');

  var shortcutHint = document.getElementById('search-shortcut-hint');
  if (shortcutHint) {
    shortcutHint.textContent = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
  }

  if (searchTrigger && searchDialog && searchInput && resultsList) {
    var BLOCK_SEL = 'p, li, pre, blockquote, td, th, dt, dd, figcaption, h1, h2, h3, h4, h5, h6';
    var HEAD_SEL = ' H1 H2 H3 H4 H5 H6 ';
    var index = [];
    // Stack of current heading per level (1..6). Higher-level headings
    // reset lower-level entries so each block records its full ancestry.
    var headingStack = [null, null, null, null, null, null, null];
    var currentTargetId = '';

    function currentHeadingPath() {
      var parts = [];
      for (var i = 1; i <= 6; i++) {
        if (headingStack[i]) parts.push(headingStack[i].text);
      }
      return parts.join(' - ');
    }

    // Anchor id of the deepest heading in scope. Used to group result rows by
    // section (see dedupeByHeading) — a stable unique id, unlike the rendered
    // heading-path text which can repeat across distinct sections.
    function currentSectionId() {
      for (var i = 6; i >= 1; i--) {
        if (headingStack[i] && headingStack[i].id) return headingStack[i].id;
      }
      return '';
    }

    var contentEl = document.getElementById('content');
    var syntheticIdCounter = 0;
    [].forEach.call(contentEl ? contentEl.querySelectorAll(BLOCK_SEL) : [], function (el) {
      var isHeading = HEAD_SEL.indexOf(' ' + el.tagName + ' ') !== -1;
      var text = el.textContent.replace(/\s*#\s*$/, '').trim();
      if (!text) return;
      if (!isHeading && el.querySelector(BLOCK_SEL)) return;
      // Cap code-block text so a single long <pre> doesn't bloat the Fuse payload.
      if (el.tagName === 'PRE' && text.length > 400) text = text.slice(0, 400);
      // Guarantee every indexed block has its own anchor so result hrefs are
      // always valid and the URL hash matches the scrolled element. Assigned
      // BEFORE the heading stack is updated so currentSectionId() always has a
      // real id for the section heading, never an empty string.
      if (!el.id) { el.id = 'search-anchor-' + (++syntheticIdCounter); }
      if (isHeading) {
        var level = parseInt(el.tagName.slice(1), 10);
        headingStack[level] = { id: el.id, text: text.replace(/^[\d.]+\s+/, '') };
        for (var j = level + 1; j <= 6; j++) headingStack[j] = null;
        currentTargetId = el.id;
      }
      index.push({
        el: el,
        text: text,
        heading: currentHeadingPath(),
        // Anchor of the owning section heading; groups body + heading blocks of
        // one section together while keeping same-titled sections distinct.
        sectionId: currentSectionId(),
        targetId: el.id,
        isHeading: isHeading,
        // Reference tables (distributions, functions, modules, profile mappings)
        // are canonical concise definitions; flag so search can boost them.
        isTable: !!el.closest('table')
      });
    });

    var fuseSearch = null;
    function getFuse() {
      if (!fuseSearch) fuseSearch = new Fuse(index, SearchHelpers.searchFuseOptions);
      return fuseSearch;
    }

    // Heading-path prefixes (lowercased) whose prose is demoted so deeper
    // reference sections outrank frontmatter/overview. The document title
    // catches the abstract; the tour chapter is intentionally redundant with
    // the reference sections.
    var demoteHeadings = [];
    var docTitleEl = document.querySelector('#content .title');
    if (docTitleEl) { demoteHeadings.push(docTitleEl.textContent.trim().toLowerCase()); }
    demoteHeadings.push('language overview');

    var pulseTimer = null;
    function jumpTo(entry) {
      entry.el.scrollIntoView({ block: 'center' });
      if (entry.targetId) { history.replaceState(null, '', '#' + entry.targetId); }
      if (pulseTimer !== null) { clearTimeout(pulseTimer); }
      document.querySelectorAll('.search-hit').forEach(function (e) {
        e.classList.remove('search-hit');
      });
      entry.el.classList.add('search-hit');
      pulseTimer = setTimeout(function () {
        entry.el.classList.remove('search-hit');
        pulseTimer = null;
      }, 1600);
    }

    var MAX_RESULTS = 40;
    function runSearch() {
      var q = searchInput.value.trim();
      resultsList.innerHTML = '';
      if (emptyMsg) { emptyMsg.hidden = true; }
      if (searchStatus) { searchStatus.textContent = ''; }
      if (!q) { return; }

      // Defense-in-depth: if search-helpers.js or fuse.min.js failed to load,
      // surface a notice instead of throwing a ReferenceError on every keystroke.
      if (typeof SearchHelpers === 'undefined' || typeof Fuse === 'undefined') {
        if (searchStatus) { searchStatus.textContent = 'Search unavailable'; }
        return;
      }

      var results = SearchHelpers.computeResults({
        rawQuery: q,
        fuse: getFuse(),
        index: index,
        maxResults: MAX_RESULTS,
        demoteHeadings: demoteHeadings
      });

      for (var r = 0; r < results.length; r++) {
        var entry = results[r].item;

        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + entry.targetId;
        a.className = 'search-result';
        if (entry.heading) {
          var h = document.createElement('span');
          h.className = 'search-result-heading';
          h.textContent = entry.heading;
          a.appendChild(h);
        }
        var sn = document.createElement('span');
        sn.className = 'search-result-snippet' + (entry.isHeading ? ' is-heading' : '');
        sn.innerHTML = SearchHelpers.buildSnippet(entry.text, q);
        a.appendChild(sn);

        (function (e) {
          a.addEventListener('click', function (ev) {
            ev.preventDefault();
            searchDialog.close();
            jumpTo(e);
          });
        })(entry);

        li.appendChild(a);
        resultsList.appendChild(li);
      }
      if (emptyMsg) { emptyMsg.hidden = results.length > 0; }
      if (searchStatus) {
        var n = results.length;
        searchStatus.textContent = n === 0 ? 'No matches' : n + ' result' + (n === 1 ? '' : 's');
      }
    }

    var searchDebounceTimer = null;
    function clearSearch() {
      if (searchDebounceTimer !== null) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
      }
      searchInput.value = '';
      resultsList.innerHTML = '';
      if (emptyMsg) { emptyMsg.hidden = true; }
      if (searchStatus) { searchStatus.textContent = ''; }
    }

    function debouncedSearch() {
      if (searchDebounceTimer !== null) { clearTimeout(searchDebounceTimer); }
      searchDebounceTimer = setTimeout(function () { searchDebounceTimer = null; runSearch(); }, 120);
    }

    function openSearch() {
      searchDialog.showModal();
      searchInput.focus();
      // Build the Fuse index now (behind the dialog-open) so the first query
      // doesn't pay the ~2-3k-entry build cost on the main thread.
      if (typeof SearchHelpers !== 'undefined' && typeof Fuse !== 'undefined') { getFuse(); }
    }

    searchTrigger.addEventListener('click', openSearch);

    // Cmd/Ctrl+K or '/' opens search from anywhere on the page.
    document.addEventListener('keydown', function (e) {
      if (searchDialog.open) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
        return;
      }
      var tag = document.activeElement ? document.activeElement.tagName : '';
      var editable = document.activeElement && document.activeElement.isContentEditable;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !editable) {
        e.preventDefault();
        openSearch();
      }
    });

    // Arrow-key navigation: Down from input enters results; Up/Down in results;
    // Up on first result returns focus to input.
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        var first = resultsList.querySelector('a.search-result');
        if (first) { e.preventDefault(); first.focus(); }
      }
    });

    resultsList.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      var items = resultsList.querySelectorAll('a.search-result');
      var idx = [].indexOf.call(items, document.activeElement);
      if (e.key === 'ArrowDown') {
        if (idx < items.length - 1) { items[idx + 1].focus(); }
      } else {
        if (idx > 0) { items[idx - 1].focus(); } else { searchInput.focus(); }
      }
    });

    // Close when clicking the backdrop (click lands on the dialog element
    // itself, not any of its children).
    searchDialog.addEventListener('click', function (e) {
      if (e.target === searchDialog) { searchDialog.close(); }
    });

    // Clear state when dialog closes (covers Escape and backdrop click).
    searchDialog.addEventListener('close', clearSearch);

    searchInput.addEventListener('input', debouncedSearch);
  }

})();

// Copy buttons for code blocks (div.sourceCode and plain pre blocks)
(function () {
  if (!navigator.clipboard) return;

  function addCopyButton(block, getTextFn) {
    var wrapper = document.createElement('div');
    wrapper.className = 'code-wrapper';
    block.parentNode.insertBefore(wrapper, block);
    wrapper.appendChild(block);
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.setAttribute('aria-live', 'polite');
    btn.textContent = 'Copy';
    wrapper.appendChild(btn);
    var resetTimer = null;
    function flash(text) {
      btn.textContent = text;
      if (resetTimer !== null) { clearTimeout(resetTimer); }
      resetTimer = setTimeout(function () {
        btn.textContent = 'Copy';
        resetTimer = null;
      }, 1500);
    }
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(getTextFn()).then(
        function () { flash('Copied!'); },
        function () { flash('Failed'); }
      );
    });
  }

  document.querySelectorAll('div.sourceCode').forEach(function (block) {
    addCopyButton(block, function () {
      var pre = block.querySelector('pre');
      return pre ? pre.innerText : '';
    });
  });

  // Plain pre blocks not already wrapped by div.sourceCode
  document.querySelectorAll('pre').forEach(function (block) {
    if (block.closest('div.sourceCode')) return;
    addCopyButton(block, function () { return block.innerText; });
  });
})();

// Heading anchor links (#)
(function () {
  document.querySelectorAll('#content h1[id], #content h2[id], #content h3[id], #content h4[id], #content h5[id], #content h6[id]').forEach(function (h) {
    var a = document.createElement('a');
    a.className = 'heading-anchor';
    a.href = '#' + h.id;
    a.setAttribute('aria-label', 'Link to this section');
    a.textContent = '#';
    h.appendChild(a);
  });
})();

// Wrap tables for horizontal scroll on narrow viewports
(function () {
  document.querySelectorAll('#content table').forEach(function (table) {
    var wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });
})();

// Footnote hover tooltips
(function () {
  var tip = document.createElement('div');
  tip.className = 'footnote-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.id = 'fn-tooltip';
  document.body.appendChild(tip);

  var activeFn = null;
  var tipW = 0, tipH = 0;

  function hide() { tip.style.display = 'none'; activeFn = null; }

  function showTip(text) {
    tip.textContent = text;
    tip.style.display = 'block';
    tip.style.left = '0'; tip.style.top = '0';
    tipW = tip.offsetWidth; tipH = tip.offsetHeight; // read once after display:block
  }

  function place(x, y) {
    if (x + tipW + 16 > window.innerWidth) x = x - tipW - 12;
    if (y + tipH + 16 > window.innerHeight) y = y - tipH - 8;
    tip.style.left = Math.max(4, x) + 'px';
    tip.style.top = Math.max(4, y) + 'px';
  }

  document.querySelectorAll('a.footnote-ref').forEach(function (ref) {
    var href = ref.getAttribute('href');
    if (!href) return;
    ref.setAttribute('aria-describedby', 'fn-tooltip');

    // Defer cloning the footnote node until first interaction. Long docs
    // can have hundreds of footnotes — eager cloning wastes memory for
    // refs that are never hovered.
    var cachedText = null;
    function getText() {
      if (cachedText !== null) return cachedText;
      var fn = document.getElementById(href.replace(/^#/, ''));
      if (!fn) return (cachedText = '');
      var clone = fn.cloneNode(true);
      var back = clone.querySelector('.footnote-back');
      if (back) back.parentNode.removeChild(back);
      cachedText = clone.textContent.trim();
      return cachedText;
    }

    ref.addEventListener('mouseenter', function (e) {
      var t = getText();
      if (!t) return;
      activeFn = ref;
      showTip(t);
      place(e.clientX + 14, e.clientY + 14);
    });
    ref.addEventListener('mousemove', function (e) {
      if (activeFn === ref) place(e.clientX + 14, e.clientY + 14);
    });
    ref.addEventListener('mouseleave', hide);
    ref.addEventListener('focus', function () {
      var t = getText();
      if (!t) return;
      activeFn = ref;
      showTip(t);
      var r = ref.getBoundingClientRect();
      place(r.left, r.bottom + 6);
    });
    ref.addEventListener('blur', hide);
  });
})();
