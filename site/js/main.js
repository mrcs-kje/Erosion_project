/* Shared behaviour: glitch into Erosion.exe, and glitch in when arriving from it. */

/* ---------- Links to Erosion.exe: glitch the current page before leaving ---------- */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// delegated, so it also catches links added later by JS
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href="erosion/index.html"]');
  if (!a || reducedMotion || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  document.body.classList.add('glitch-out');
  setTimeout(() => { location.href = a.href; }, 550);
});
// arriving from Erosion.exe: glitch into this page
try {
  if (sessionStorage.getItem('glitch-arrive')) {
    sessionStorage.removeItem('glitch-arrive');
    if (!reducedMotion) {
      document.body.classList.add('glitch-in');
      setTimeout(() => document.body.classList.remove('glitch-in'), 750);
    }
  }
} catch (_) { /* storage blocked: skip the effect */ }
// coming back with the browser's back button: remove the glitch state
window.addEventListener('pageshow', () => document.body.classList.remove('glitch-out'));
