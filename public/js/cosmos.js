
// A single decorative layer survives hash navigation and never intercepts page input.
export function initCosmos() {
  if (document.getElementById('cosmos')) return;
  const canvas = document.createElement('canvas');
  if (typeof canvas.getContext !== 'function') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.id = 'cosmos';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width, height, stars = [], frame = 0, last = 0;
  let pointer = { x: -1000, y: -1000 };
  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr; canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.min(130, Math.round(width * height / 9000)) }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      r: .5 + Math.random() * 1.5, phase: Math.random() * Math.PI * 2, speed: 3 + Math.random() * 9,
    }));
    render(performance.now(), 0);
  }
  function render(now, dt) {
    ctx.clearRect(0, 0, width, height);
    const dark = document.documentElement.dataset.theme === 'dark';
    for (const s of stars) {
      s.y -= dt * s.speed;
      if (s.y < -3) s.y = height + 3;
      const alpha = motion.matches ? .6 : .45 + .3 * Math.sin(now / 1400 + s.phase);
      ctx.fillStyle = dark ? `rgba(205,218,255,${alpha})` : `rgba(91,89,173,${alpha})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      const distance = Math.hypot(s.x - pointer.x, s.y - pointer.y);
      if (!motion.matches && distance < 110) {
        ctx.strokeStyle = `rgba(154,143,246,${(1 - distance / 110) * .3})`;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
      }
    }

  }
  function tick(now) {
    render(now, Math.min((now - (last || now)) / 1000, .05)); last = now;
    frame = requestAnimationFrame(tick);
  }
  function syncAnimation() {
    cancelAnimationFrame(frame); last = 0;
    if (!document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
    else render(performance.now(), 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = { x: -1000, y: -1000 }; });
  document.addEventListener('visibilitychange', syncAnimation);
  motion.addEventListener('change', syncAnimation);
  new MutationObserver(() => { if (motion.matches) render(performance.now(), 0); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  resize(); syncAnimation();

}
