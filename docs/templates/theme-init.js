// Applied synchronously to prevent flash of wrong theme before CSS loads.
(function () {
  var t;
  // Storage may be blocked (opaque origins, private mode restrictions, etc.);
  // silence the error and fall through to the system preference.
  try {
    t = localStorage.getItem('flatppl-theme');
    if (!t) {
      t = localStorage.getItem('theme');
      if (t === 'light' || t === 'dark') { localStorage.setItem('flatppl-theme', t); }
    }
  } catch (e) { }
  if (t !== 'light' && t !== 'dark') { t = null; }
  if (!t) { t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  document.documentElement.setAttribute('data-theme', t);
})();
