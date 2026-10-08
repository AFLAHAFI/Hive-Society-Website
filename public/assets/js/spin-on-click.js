// Special webmaster card :P Clicking an element with class "spin-on-click" spins it once; clicking
// again restarts the spin. The animation lives in css/base.css (and is off for reduced motion).
document.querySelectorAll('.spin-on-click').forEach((el) => {
  el.addEventListener('click', () => {
    el.classList.remove('spinning');
    void el.offsetWidth; // force a reflow so re-adding the class restarts the animation
    el.classList.add('spinning');
  });
  el.addEventListener('animationend', () => el.classList.remove('spinning'));
});
