import { readStored, writeStored } from './util.js';

// Web adaptation of dafeiyu-pet's three-view movement and drag behavior.
// Source and MIT notice: /pet/README.md and /pet/dafeiyu/LICENSE.
export function initPet() {
  if (document.getElementById('space-pet') || typeof document.createElement('canvas').getContext !== 'function') return;
  const pet = document.createElement('aside');
  pet.id = 'space-pet'; pet.className = 'space-pet'; pet.setAttribute('aria-label', '大肥鱼桌宠');
  pet.innerHTML = `<button type="button" class="space-pet__character" aria-label="移动大肥鱼；可拖拽或使用方向键" title="拖动移动 · 方向键调整位置">
      <span class="space-pet__sprite"><img src="/pet/dafeiyu/front.png" alt="蓝发鲸鱼娘大肥鱼" draggable="false"></span>
    </button>`;
  const dock = document.createElement('aside');
  dock.className = 'space-pet-dock'; dock.setAttribute('aria-label', '桌宠控制');
  dock.innerHTML = `<div class="space-pet-dock__row">
      <label class="space-pet__mode">陪伴模式 <select aria-label="桌宠陪伴模式"><option value="stay">原地待着</option><option value="wander">自由散步</option><option value="follow">跟随鼠标</option></select></label>
      <button type="button" class="space-pet-toggle" aria-controls="space-pet">🐋</button>
    </div>
    <div class="space-pet__credit">素材：<a href="https://github.com/1190fasheqi/dafeiyu-pet" target="_blank" rel="noopener noreferrer">大肥鱼开源项目 ↗</a> · <a href="/pet/dafeiyu/LICENSE" target="_blank" rel="noopener noreferrer">MIT 许可</a></div>
    <button type="button" class="space-pet__retry" hidden>重新加载桌宠</button>`;
  document.body.append(pet, dock);
  const character = pet.querySelector('.space-pet__character'), sprite = pet.querySelector('img');
  const select = dock.querySelector('select'), toggle = dock.querySelector('.space-pet-toggle');
  const retry = dock.querySelector('.space-pet__retry'), motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sprites = { front: '/pet/dafeiyu/front.png', side: '/pet/dafeiyu/side.png', back: '/pet/dafeiyu/back.png' };
  let mode = readStored('pet-dafeiyu-mode', 'stay');
  if (!['stay', 'wander', 'follow'].includes(mode)) mode = 'stay';
  select.value = mode;
  let position, drag = null;
  let target = null, pointer = null, frame = 0, last = 0, restUntil = 0, hovering = false, keyboardFocus = false;
  let face = 'front';
  try { position = JSON.parse(readStored('pet-position', 'null')); } catch { /* Ignore invalid preferences. */ }
  function bounds() {
    const viewport = window.visualViewport, rect = pet.getBoundingClientRect();
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const floor = Number.parseFloat(getComputedStyle(pet).getPropertyValue('--pet-floor')) || 16;
    return { minX: left + 8, minY: top + 8, maxX: Math.max(left + 8, left + width - rect.width - 8),
      maxY: Math.max(top + 8, top + height - rect.height - floor) };
  }
  function clamp(x, y) {
    const b = bounds(); return { x: Math.max(b.minX, Math.min(x, b.maxX)), y: Math.max(b.minY, Math.min(y, b.maxY)) };
  }
  function place(x, y, save = false) {
    position = clamp(x, y); pet.style.left = `${position.x}px`; pet.style.top = `${position.y}px`;
    if (save) writeStored('pet-position', JSON.stringify(position));
  }
  function setFace(dx = 0, dy = 0) {
    const next = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'side' : dy < 0 ? 'back' : 'front';
    if (next !== face) { face = next; sprite.src = sprites[face]; }
    pet.dataset.facing = next === 'side' ? dx < 0 ? 'left' : 'right' : next;
  }
  sprite.addEventListener('load', () => { pet.dataset.state = 'ready'; retry.hidden = true; });
  sprite.addEventListener('error', () => { pet.dataset.state = 'error'; retry.hidden = false; sync(); });
  if (sprite.complete && sprite.naturalWidth) pet.dataset.state = 'ready';
  retry.addEventListener('click', () => { sprite.src = sprites[face]; pet.dataset.state = 'loading'; });
  const running = () => !pet.hidden && !document.hidden && !motion.matches && pet.dataset.state !== 'error';
  function sync() {
    cancelAnimationFrame(frame); last = 0;
    pet.dataset.paused = String(document.hidden || pet.hidden);
    pet.dataset.reduced = String(motion.matches);
    pet.dataset.mode = mode;
    toggle.setAttribute('aria-expanded', String(!pet.hidden));
    toggle.setAttribute('aria-label', pet.hidden ? '恢复大肥鱼桌宠' : '收起大肥鱼桌宠');
    toggle.title = pet.hidden ? '恢复大肥鱼桌宠' : '收起大肥鱼桌宠';
    if (!running()) { pet.classList.remove('is-walking'); target = null; }
    if (running() && mode !== 'stay') frame = requestAnimationFrame(tick);
  }
  function tick(time) {
    if (!running() || mode === 'stay') return;
    const dt = Math.min((time - (last || time)) / 1000, .05); last = time;
    const busy = drag || hovering || (keyboardFocus && (pet.contains(document.activeElement) || dock.contains(document.activeElement))) || time < restUntil;
    if (!busy) {
      if (mode === 'follow' && pointer) {
        const rect = pet.getBoundingClientRect();
        // Leave room for the cursor so the pet never chases a button being used.
        const near = Math.hypot(pointer.x - (position.x + rect.width / 2), pointer.y - (position.y + rect.height / 2)) < 170;
        target = near ? null : clamp(pointer.x - rect.width / 2, pointer.y - rect.height / 2 + 100);
      } else if (mode === 'wander' && !target) {
        const b = bounds(); target = { x: b.minX + Math.random() * (b.maxX - b.minX), y: b.minY + Math.random() * (b.maxY - b.minY) };
      }
      if (target) {
        const dx = target.x - position.x, dy = target.y - position.y, distance = Math.hypot(dx, dy);
        if (distance < 3) { target = null; restUntil = time + 3500 + Math.random() * 4000; setFace(); place(position.x, position.y, true); }
        else { const step = Math.min(distance, dt * 65); setFace(dx, dy); place(position.x + dx / distance * step, position.y + dy / distance * step); }
      }
    }
    pet.classList.toggle('is-walking', Boolean(target && !busy));
    frame = requestAnimationFrame(tick);
  }
  const valid = position && Number.isFinite(position.x) && Number.isFinite(position.y);
  place(valid ? position.x : innerWidth - 90, valid ? position.y : innerHeight - 240);
  pet.hidden = readStored('pet-hidden', 'false') === 'true';
  toggle.addEventListener('click', () => {
    pet.hidden = !pet.hidden; writeStored('pet-hidden', pet.hidden);
    if (!pet.hidden) place(position.x, position.y);
    sync();
  });
  select.addEventListener('change', () => {
    mode = select.value; target = null; restUntil = 0;
    writeStored('pet-dafeiyu-mode', mode); setFace(); sync();
  });
  character.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return;
    target = null;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: { ...position }, moved: false };
    character.setPointerCapture(e.pointerId);
  });
  character.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) { pet.classList.add('is-dragging'); setFace(dx, dy); place(drag.start.x + dx, drag.start.y + dy); }
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null; target = null;
    restUntil = performance.now() + 2500; pet.classList.remove('is-dragging'); setFace(); place(position.x, position.y, true);
    if (character.hasPointerCapture(e.pointerId)) character.releasePointerCapture(e.pointerId);
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) character.addEventListener(event, endDrag);
  character.addEventListener('keydown', e => {
    const move = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[e.key];
    if (!move) return; e.preventDefault(); target = null; setFace(...move); place(position.x + move[0], position.y + move[1], true);
  });
  pet.addEventListener('pointerenter', () => { hovering = true; });
  pet.addEventListener('pointerleave', () => { hovering = false; });
  document.addEventListener('pointerdown', () => { keyboardFocus = false; }, { passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboardFocus = true; });
  document.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = null; target = null; });
  const resize = () => { target = null; if (!pet.hidden) place(position.x, position.y); };
  window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize);
  window.addEventListener('blur', () => { pointer = null; target = null; });
  document.addEventListener('visibilitychange', sync); motion.addEventListener('change', sync);
  sprite.addEventListener('load', sync);
  sync();
}
