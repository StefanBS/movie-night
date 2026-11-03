// Loads this design system into the template. In a consuming project, point
// base at the bound DS folder relative to this file (e.g. '_ds/<folder>' at
// the project root, '../_ds/<folder>' one level down) — one line to edit.
(() => {
  const base = '../..';
  for (const p of ["tokens/fonts.css","tokens/colors.css","tokens/typography.css","tokens/spacing.css","styles.css","components/bundle.css"]) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = base + '/' + p;
    document.head.appendChild(l);
  }
  // components/bundle.js reads window.React when it loads, so wait for React first.
  const load = () => {
    if (!window.React) return setTimeout(load, 30);
    const s = document.createElement('script');
    s.src = base + '/components/bundle.js';
    s.onerror = () => console.error('ds-base.js: failed to load ' + s.src + ' — if this is a consuming project, point the base line in ds-base.js at the bound _ds/<folder> tree relative to this page.');
    document.head.appendChild(s);
  };
  load();
})();
