import { readStored, writeStored } from './util.js';

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
  let width, height, stars = [], sparks = [], frame = 0, last = 0;
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
  function burst(x, y, hearts = false) {
    if (motion.matches) return;
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 35 + Math.random() * 100;
      sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, hearts, color: hearts ? '#ff91ba' : ['#bda7ff', '#8de6ff', '#ffe8a0'][i % 3] });
    }
    sparks = sparks.slice(-120);
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
    sparks = sparks.filter(s => s.life > 0);
    for (const s of sparks) {
      s.life -= dt * .7; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 35 * dt;
      ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = s.color;
      if (s.hearts) { ctx.font = '17px sans-serif'; ctx.fillText('♥', s.x, s.y); }
      else { ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
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

  const pet = document.createElement('aside');
  pet.className = 'space-pet';
  pet.setAttribute('aria-label', '星空桌宠');
  pet.innerHTML = `<div class="space-pet__bubble" role="status" aria-live="polite">我是你的学习搭子 ✦<br>拖动我，或点一下试试！</div>
    <button class="space-pet__character" aria-label="和桌宠互动，可拖动；方向键移动，回车互动" title="拖动移动 · 点击互动 · 方向键移动">
      <img src="/pet.svg" alt="中分头、黄脸红腮、穿黑色背带衣并抱着篮球的小伙伴" draggable="false">
    </button><div class="space-pet__tools"><button data-action="hide" aria-label="收起桌宠" title="收起桌宠">−</button></div>`;
  const restore = document.createElement('button');
  restore.className = 'space-pet-restore'; restore.textContent = '✦';
  restore.setAttribute('aria-label', '显示桌宠'); restore.title = '召唤学习搭子';
  document.body.append(pet, restore);
  const character = pet.querySelector('.space-pet__character');
  const bubble = pet.querySelector('.space-pet__bubble');
  let position = null;
  try { position = JSON.parse(readStored('pet-position', 'null')); } catch { /* Ignore invalid saved positions. */ }
  let drag = null, suppressClick = false, effect = 0, bubbleTimer, effectTimer;
  function place(x, y, save = false) {
    const rect = pet.getBoundingClientRect();
    position = { x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - (window.innerWidth <= 720 ? 85 : 12))) };
    pet.style.left = `${position.x}px`; pet.style.top = `${position.y}px`;
    bubble.classList.toggle('is-below', position.y < 110);
    if (save) writeStored('pet-position', JSON.stringify(position));
  }
  function setHidden(hidden) {
    pet.hidden = hidden; restore.hidden = !hidden; writeStored('pet-hidden', hidden);
    if (!hidden) { place(position.x, position.y); character.focus(); }
    else restore.focus();
  }
  const validPosition = position && Number.isFinite(position.x) && Number.isFinite(position.y);
  place(validPosition ? position.x : window.innerWidth - 150, validPosition ? position.y : window.innerHeight - 230);
  pet.hidden = readStored('pet-hidden', 'false') === 'true'; restore.hidden = !pet.hidden;
  window.addEventListener('resize', () => { if (!pet.hidden) place(position.x, position.y); });
  pet.querySelector('[data-action="hide"]').addEventListener('click', () => setHidden(true));
  restore.addEventListener('click', () => setHidden(false));
  function interact() {
    const effects = [
      ['wave', '嗨！今天也要闪闪发光 ✨'],
      ['bounce', '学习中场休息，来个三分球！🏀'],
      ['love', '送你一颗小心心，慢慢来就好 ♡'],
      ['spin', '星星为你加油！再完成一个小目标 ✦'],
    ];
    const [name, text] = effects[effect++ % effects.length];
    clearTimeout(bubbleTimer); clearTimeout(effectTimer);
    character.dataset.effect = ''; void character.offsetWidth; character.dataset.effect = name;
    bubble.textContent = text; bubble.classList.remove('is-quiet');
    const rect = character.getBoundingClientRect();
    burst(rect.left + rect.width / 2, rect.top + rect.height / 3, name === 'love');
    effectTimer = setTimeout(() => { character.dataset.effect = ''; }, 1200);
    bubbleTimer = setTimeout(() => bubble.classList.add('is-quiet'), 4500);
  }
  character.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return;
    suppressClick = false;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: { ...position }, moved: false };
    character.setPointerCapture(e.pointerId);
  });
  character.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) { pet.classList.add('is-dragging'); place(drag.start.x + dx, drag.start.y + dy); }
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    suppressClick = drag.moved || e.type === 'pointercancel';
    drag = null; pet.classList.remove('is-dragging'); place(position.x, position.y, true);
    if (character.hasPointerCapture(e.pointerId)) character.releasePointerCapture(e.pointerId);
  }
  character.addEventListener('pointerup', endDrag);
  character.addEventListener('pointercancel', endDrag);
  character.addEventListener('lostpointercapture', endDrag);
  character.addEventListener('click', e => {
    if (suppressClick && e.detail !== 0) { suppressClick = false; return; }
    suppressClick = false; interact();
  });
  character.addEventListener('keydown', e => {
    const moves = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
    if (!moves[e.key]) return;
    e.preventDefault(); const [dx, dy] = moves[e.key]; place(position.x + dx, position.y + dy, true);
  });
  bubbleTimer = setTimeout(() => bubble.classList.add('is-quiet'), 6000);
}
