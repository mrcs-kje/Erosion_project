/* Erosion.exe, glitch-in + terminal typing on arrival, INTERCEPT → delete everything → glitch home. */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scope = [...document.querySelectorAll('.ero-header, .ero-main, .ero-footer')];
  const visuals = [...document.querySelectorAll('.ero-figure, .ero-texture, .ero-unresolved img')];
  const intercept = document.querySelector('.ero-intercept');

  // every piece of visible text, in reading order
  const textNodes = () => scope.flatMap((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest('svg') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const out = []; while (walker.nextNode()) out.push(walker.currentNode); return out;
  });

  const caret = document.createElement('span');
  caret.className = 'ero-caret';
  caret.setAttribute('aria-hidden', 'true');

  /* ---------- Arrival: glitch in, then type all text like a terminal ---------- */
  function boot() {
    if (reduce) return;
    // screen readers get the full text at once; the typing is only visual
    const main = document.querySelector('.ero-main');
    const srCopy = document.createElement('div');
    srCopy.className = 'visually-hidden';
    srCopy.textContent = main.innerText;
    main.before(srCopy);
    main.setAttribute('aria-hidden', 'true');
    const nodes = textNodes();
    const full = nodes.map((n) => n.nodeValue);
    nodes.forEach((n) => { n.nodeValue = ''; });
    visuals.forEach((v) => v.classList.add('ero-hidden'));
    document.body.classList.add('glitch-in');
    document.body.setAttribute('aria-busy', 'true');

    setTimeout(() => {
      document.body.classList.remove('glitch-in');
      let i = 0, pos = 0;
      const perFrame = 7; // characters per animation frame
      const tick = () => {
        let budget = perFrame;
        while (budget > 0 && i < nodes.length) {
          const take = Math.min(budget, full[i].length - pos);
          pos += take; budget -= take;
          nodes[i].nodeValue = full[i].slice(0, pos);
          nodes[i].parentNode.insertBefore(caret, nodes[i].nextSibling);
          if (pos >= full[i].length) { i++; pos = 0; }
        }
        // reveal images gradually as the text is written
        visuals.forEach((v, k) => { if (i / nodes.length > k / visuals.length) v.classList.remove('ero-hidden'); });
        if (i < nodes.length) requestAnimationFrame(tick);
        else { caret.remove(); document.body.removeAttribute('aria-busy'); main.removeAttribute('aria-hidden'); srCopy.remove(); }
      };
      requestAnimationFrame(tick);
    }, 700);
  }

  // glitch this page out; the next page glitches in (see main.js, "glitch-arrive")
  function leave(url) {
    try { sessionStorage.setItem('glitch-arrive', '1'); } catch (_) { /* storage blocked: no glitch-in */ }
    document.body.classList.add('glitch-out');
    setTimeout(() => { location.href = url; }, 550);
  }

  /* ---------- INTERCEPT: delete text + elements, then glitch back to home ---------- */
  let exiting = false;
  function exit() {
    if (exiting) return;
    exiting = true;
    intercept.textContent = 'INTERCEPT';
    intercept.classList.add('is-active');
    if (reduce) { location.href = '../404.html'; return; }

    const nodes = textNodes().filter((n) => !intercept.contains(n)).reverse();
    visuals.forEach((v) => { v.style.transitionDelay = `${Math.random() * 600}ms`; v.classList.add('ero-hidden', 'ero-flicker'); });
    let i = 0;
    const tick = () => {
      let budget = 12;
      while (budget > 0 && i < nodes.length) {
        const n = nodes[i];
        const cut = Math.min(budget, n.nodeValue.length);
        n.nodeValue = n.nodeValue.slice(0, n.nodeValue.length - cut);
        budget -= cut;
        n.parentNode.insertBefore(caret, n.nextSibling);
        if (!n.nodeValue.length) i++;
      }
      if (i < nodes.length) requestAnimationFrame(tick);
      else { caret.remove(); leave('../404.html'); }
    };
    setTimeout(() => requestAnimationFrame(tick), 250);
  }

  intercept.addEventListener('click', exit);

  /* ---------- Any other way out (Terminate → home, Contact …): glitch out, glitch into the next page ---------- */
  document.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (a.target === '_blank' || href.startsWith('#') || a.hasAttribute('data-instagram')) return;
    a.addEventListener('click', (e) => {
      if (reduce || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      leave(a.href);
    });
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });
  boot();
})();
