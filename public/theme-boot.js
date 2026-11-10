// The colour theme, set before the page draws (no flash of another theme). A file of its own because the site's CSP allows no
// inline script. The setting is src/theme.ts's (same key, same rule): Dark by default; Light; Contrast; Red; or Auto (Light when
// the device's appearance is light, Contrast when it asks for more contrast, else Dark).
(function () {
  var t = 'dark', mq = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
  try {
    var s = localStorage.getItem('enoch.theme.v1');
    if (s === 'light' || s === 'contrast' || s === 'red') t = s;
    else if (s === 'auto') t = mq('(prefers-color-scheme: light)') ? 'light' : mq('(prefers-contrast: more)') ? 'contrast' : 'dark';
  } catch (e) { /* private mode: the default */ }
  document.documentElement.setAttribute('data-theme', t);
})();
