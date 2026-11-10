// The colour theme, set before the page draws (no flash of the other theme). A file of its own because the site's CSP allows
// no inline script. The setting is src/theme.ts's (same key, same rule): Dark by default; Light; or Auto, the device's appearance.
(function () {
  var t = 'dark';
  try {
    var s = localStorage.getItem('enoch.theme.v1');
    if (s === 'light' || (s === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches)) t = 'light';
  } catch (e) { /* private mode: the default */ }
  document.documentElement.setAttribute('data-theme', t);
})();
