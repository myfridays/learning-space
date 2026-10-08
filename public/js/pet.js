import { readStored, writeStored } from './util.js';

// Web adaptation of dafeiyu-pet's three-view movement and click/drag behavior.
// Source and MIT notice: /pet/README.md and /pet/dafeiyu/LICENSE.
export function initPet() {
  if (document.getElementById('space-pet') || typeof document.createElement('canvas').getContext !== 'function') return;
  const pet = document.createElement('aside');
  pet.id = 'space-pet'; pet.className = 'space-pet'; pet.setAttribute('aria-label', '大肥鱼桌宠');
  pet.innerHTML = `<div class="space-pet__bubble" role="status" aria-live="polite">今天也陪你一起学习！</div>
    <div class="space-pet__tools">
      <button type="button" data-action="pause" aria-label="暂停桌宠动作" aria-pressed="false">Ⅱ</button>
      <button type="button" data-action="hide" aria-label="收起桌宠">−</button>
    </div>
    <button type="button" class="space-pet__character" aria-label="和大肥鱼互动；拖动移动，方向键调整位置" title="拖动移动 · 点击互动 · 双击喂食">
      <span class="space-pet__sprite"><img src="/pet/dafeiyu/front.png" alt="蓝发鲸鱼娘大肥鱼" draggable="false"></span>
    </button>
    <button type="button" class="space-pet__retry" hidden>重新加载桌宠</button>
    <label class="space-pet__mode">陪伴模式 <select aria-label="桌宠陪伴模式"><option value="stay">原地待着</option><option value="wander">自由散步</option><option value="follow">跟随鼠标</option></select></label>
    <div class="space-pet__actions" aria-label="桌宠互动">
      <button type="button" data-reaction="pat">摸摸</button><button type="button" data-reaction="feed">喂食</button><button type="button" data-reaction="jump">跳一跳</button>
    </div>
    <a class="space-pet__credit" href="https://github.com/1190fasheqi/dafeiyu-pet" target="_blank" rel="noopener noreferrer">大肥鱼 · 开源项目 ↗</a>
    <div class="space-pet__particles" aria-hidden="true"></div>`;
  const restore = document.createElement('button');
  restore.type = 'button'; restore.className = 'space-pet-restore'; restore.textContent = '🐋';
  restore.setAttribute('aria-label', '显示大肥鱼桌宠'); restore.title = '召唤大肥鱼';
  document.body.append(pet, restore);
  const character = pet.querySelector('.space-pet__character'), sprite = pet.querySelector('img');
  const bubble = pet.querySelector('.space-pet__bubble'), pause = pet.querySelector('[data-action="pause"]');
  const select = pet.querySelector('select'), particles = pet.querySelector('.space-pet__particles');
  const retry = pet.querySelector('.space-pet__retry'), motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sprites = { front: '/pet/dafeiyu/front.png', side: '/pet/dafeiyu/side.png', back: '/pet/dafeiyu/back.png' };
  let mode = readStored('pet-dafeiyu-mode', 'stay');
  if (!['stay', 'wander', 'follow'].includes(mode)) mode = 'stay';
  select.value = mode;
  let position, drag = null, suppressClick = false, paused = readStored('pet-paused', 'false') === 'true';
  let target = null, pointer = null, frame = 0, last = 0, restUntil = 0, hovering = false, keyboardFocus = false;
  let bubbleTimer, effectTimer, clickTimer, sequence = 0, face = 'front';
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
    bubble.classList.toggle('is-below', position.y - (window.visualViewport?.offsetTop || 0) < 75);
    if (save) writeStored('pet-position', JSON.stringify(position));
  }
  function setFace(dx = 0, dy = 0) {
    const next = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'side' : dy < 0 ? 'back' : 'front';
    if (next !== face) { face = next; sprite.src = sprites[face]; }
    pet.dataset.facing = next === 'side' ? dx < 0 ? 'left' : 'right' : next;
  }
  sprite.addEventListener('load', () => { pet.dataset.state = 'ready'; retry.hidden = true; });
  sprite.addEventListener('error', () => { pet.dataset.state = 'error'; retry.hidden = false; say('图片暂时没有加载，点下方按钮重试。'); sync(); });
  if (sprite.complete && sprite.naturalWidth) pet.dataset.state = 'ready';
  retry.addEventListener('click', () => { sprite.src = sprites[face]; pet.dataset.state = 'loading'; });
  function say(text) {
    clearTimeout(bubbleTimer); bubble.textContent = text; bubble.classList.remove('is-quiet');
    bubbleTimer = setTimeout(() => bubble.classList.add('is-quiet'), 4200);
  }
  function clearEffect() {
    clearTimeout(effectTimer); particles.replaceChildren(); delete pet.dataset.reaction;
  }
  const running = () => !pet.hidden && !document.hidden && !paused && !motion.matches && pet.dataset.state !== 'error';
  function sync() {
    cancelAnimationFrame(frame); last = 0;
    pet.dataset.paused = String(paused || document.hidden || pet.hidden);
    pet.dataset.reduced = String(motion.matches);
    pet.dataset.mode = mode;
    pause.setAttribute('aria-pressed', String(paused));
    pause.setAttribute('aria-label', paused ? '继续桌宠动作' : '暂停桌宠动作');
    pause.title = paused ? '继续桌宠动作' : '暂停桌宠动作'; pause.textContent = paused ? '▷' : 'Ⅱ';
    if (!running()) { pet.classList.remove('is-walking'); target = null; clearEffect(); }
    if (running() && mode !== 'stay') frame = requestAnimationFrame(tick);
  }
  function tick(time) {
    if (!running() || mode === 'stay') return;
    const dt = Math.min((time - (last || time)) / 1000, .05); last = time;
    const busy = drag || hovering || (keyboardFocus && pet.contains(document.activeElement)) || pet.dataset.reaction || time < restUntil;
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
  function interact(name) {
    if (paused) { say('我先休息一下，点 ▷ 就回来。'); return; }
    const lines = { pat: '摸摸收到啦，今天也要元气满满 ♡', feed: '小鱼干！谢谢款待，吃饱才有力气陪你～', jump: '蹦一下！给认真学习的你加油 ✦' };
    clearEffect(); target = null; restUntil = performance.now() + 2500; setFace();
    say(lines[name]); void character.offsetWidth; pet.dataset.reaction = name;
    if (!motion.matches) {
      for (let i = 0; i < 5; i++) {
        const spark = document.createElement('span'); spark.textContent = name === 'feed' ? '🐟' : name === 'pat' ? '♥' : '✦';
        spark.style.setProperty('--dx', `${(i - 2) * 24}px`); spark.style.setProperty('--dy', `${-40 - (i % 3) * 20}px`); particles.append(spark);
      }
    }
    effectTimer = setTimeout(clearEffect, 1200);
  }
  const valid = position && Number.isFinite(position.x) && Number.isFinite(position.y);
  place(valid ? position.x : innerWidth - 224, valid ? position.y : innerHeight - 380);
  pet.hidden = readStored('pet-hidden', 'false') === 'true'; restore.hidden = !pet.hidden;
  function hide(hidden) {
    clearTimeout(clickTimer); pet.hidden = hidden; restore.hidden = !hidden; writeStored('pet-hidden', hidden);
    if (!hidden) { place(position.x, position.y); character.focus(); } else restore.focus(); sync();
  }
  pet.querySelector('[data-action="hide"]').addEventListener('click', () => hide(true));
  restore.addEventListener('click', () => hide(false));
  pause.addEventListener('click', () => { paused = !paused; writeStored('pet-paused', paused); sync(); });
  select.addEventListener('change', () => {
    mode = select.value; target = null; restUntil = 0; writeStored('pet-dafeiyu-mode', mode); setFace(); sync();
    say(motion.matches && mode !== 'stay' ? '已选择模式；减少动态效果开启时，我会原地陪你。' : { stay: '我就在这里陪你。', wander: '出去散散步，待会儿见！', follow: '移动鼠标，我慢慢跟上你～' }[mode]);
  });
  pet.querySelectorAll('[data-reaction]').forEach(button => button.addEventListener('click', () => interact(button.dataset.reaction)));
  character.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return;
    suppressClick = false; target = null;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: { ...position }, moved: false };
    character.setPointerCapture(e.pointerId);
  });
  character.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) { clearTimeout(clickTimer); pet.classList.add('is-dragging'); setFace(dx, dy); place(drag.start.x + dx, drag.start.y + dy); }
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    suppressClick = drag.moved || e.type === 'pointercancel'; drag = null; target = null;
    restUntil = performance.now() + 2500; pet.classList.remove('is-dragging'); setFace(); place(position.x, position.y, true);
    if (character.hasPointerCapture(e.pointerId)) character.releasePointerCapture(e.pointerId);
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) character.addEventListener(event, endDrag);
  character.addEventListener('click', e => {
    if (suppressClick && e.detail !== 0) { suppressClick = false; return; }
    suppressClick = false; clearTimeout(clickTimer);
    if (e.detail === 0) interact(['pat', 'feed', 'jump'][sequence++ % 3]);
    else if (e.detail < 2) clickTimer = setTimeout(() => interact(['pat', 'feed', 'jump'][sequence++ % 3]), 280);
  });
  character.addEventListener('dblclick', () => { clearTimeout(clickTimer); interact('feed'); });
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
  sync(); bubbleTimer = setTimeout(() => bubble.classList.add('is-quiet'), 5000);
}
