// Applied synchronously to prevent flash of wrong theme before CSS loads.
(function () {
  var t;
  // Storage may be blocked (opaque origins, private mode restrictions, etc.);
  // silence the error and fall through to the system preference.
  try { t = localStorage.getItem('theme'); } catch (e) { }
  if (!t) { t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  document.documentElement.setAttribute('data-theme', t);
})();
