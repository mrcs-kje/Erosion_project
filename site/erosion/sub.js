/* Dummy pages inside Erosion.exe: glitch out of the page, the next page glitches in (see main.js, "glitch-arrive"). */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || reduce || a.target === '_blank' || a.getAttribute('href').startsWith('#') || a.hasAttribute('data-instagram')) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    try { sessionStorage.setItem('glitch-arrive', '1'); } catch (_) { /* storage blocked: no glitch-in */ }
    document.body.classList.add('glitch-out');
    setTimeout(() => { location.href = a.href; }, 550);
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
})();
