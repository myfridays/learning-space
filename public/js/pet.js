import { readStored, writeStored } from './util.js';
import { createPetRenderer } from './pet-renderer.js';

export function initPet() {
  if (document.getElementById('space-pet') || typeof document.createElement('canvas').getContext !== 'function') return;
  const pet = document.createElement('aside');
  pet.id = 'space-pet'; pet.className = 'space-pet';
  pet.setAttribute('aria-label', '仇远桌宠');
  pet.innerHTML = `<div class="space-pet__bubble" role="status" aria-live="polite">仇远正在赶来…</div>
    <div class="space-pet__tools">
      <button type="button" data-action="pause" aria-label="暂停桌宠动作" aria-pressed="false" title="暂停桌宠动作">Ⅱ</button>
      <button type="button" data-action="hide" aria-label="收起桌宠" title="收起桌宠">−</button>
    </div>
    <button type="button" class="space-pet__character" aria-label="和仇远互动；拖动移动，方向键调整位置" title="拖动移动 · 点击互动 · 方向键移动">
      <canvas class="space-pet__canvas" aria-hidden="true"></canvas>
      <span class="space-pet__placeholder">仇远<span>准备陪你学习</span></span>
    </button>
    <button type="button" class="space-pet__begin" hidden>开始陪伴</button>
    <button type="button" class="space-pet__retry" hidden>重新加载桌宠</button>
    <div class="space-pet__actions" aria-label="桌宠互动">
      <button type="button" data-reaction="wink" title="摸摸头">摸摸</button>
      <button type="button" data-reaction="type" title="一起敲键盘">击键</button>
      <button type="button" data-reaction="nod" title="给你加油">加油</button>
    </div>
    <button type="button" class="space-pet__credit" title="查看素材自带说明">素材：B站 @宇痕/</button>
    <div class="space-pet__particles" aria-hidden="true"></div>`;
  const restore = document.createElement('button');
  restore.className = 'space-pet-restore'; restore.type = 'button'; restore.textContent = '✦';
  restore.setAttribute('aria-label', '显示仇远桌宠'); restore.title = '召唤仇远';
  document.body.append(pet, restore);
  const character = pet.querySelector('.space-pet__character');
  let canvas = pet.querySelector('canvas');
  const bubble = pet.querySelector('.space-pet__bubble');
  const begin = pet.querySelector('.space-pet__begin');
  const retry = pet.querySelector('.space-pet__retry');
  const pause = pet.querySelector('[data-action="pause"]');
  const particles = pet.querySelector('.space-pet__particles');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let renderer, loading = false, paused = readStored('pet-paused', 'false') === 'true';
  let started = readStored('pet-qiuyuan-started', 'false') === 'true';
  let position = null, drag = null, suppressClick = false, sequence = 0, bubbleTimer, effectTimer;
  try { position = JSON.parse(readStored('pet-position', 'null')); } catch { /* Invalid old preference. */ }
  function place(x, y, save = false) {
    const rect = pet.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
    const floor = parseFloat(getComputedStyle(pet).getPropertyValue('--pet-floor')) || 16;
    position = { x: Math.max(left + 8, Math.min(x, left + width - rect.width - 8)),
      y: Math.max(top + 8, Math.min(y, top + height - rect.height - floor)) };
    pet.style.left = `${position.x}px`; pet.style.top = `${position.y}px`;
    bubble.classList.toggle('is-below', position.y - top < 80);
    if (save) writeStored('pet-position', JSON.stringify(position));
  }
  function say(text) {
    clearTimeout(bubbleTimer); bubble.textContent = text; bubble.classList.remove('is-quiet');
    bubbleTimer = setTimeout(() => bubble.classList.add('is-quiet'), 4200);
  }
  function sync() {
    const running = !pet.hidden && !document.hidden && !paused;
    renderer?.setActive(running, motion.matches);
    pet.dataset.paused = String(paused);
    pause.setAttribute('aria-pressed', String(paused));
    pause.setAttribute('aria-label', paused ? '继续桌宠动作' : '暂停桌宠动作');
    pause.title = paused ? '继续桌宠动作' : '暂停桌宠动作'; pause.textContent = paused ? '▷' : 'Ⅱ';
    if (!running) renderer?.reset();
  }
  async function load() {
    if (renderer || loading) return;
    loading = true; retry.hidden = true; pet.dataset.state = 'loading';
    say('仇远正在赶来…');
    // A failed renderer destroys its WebGL context; retry on a fresh canvas.
    const nextCanvas = canvas.cloneNode(false);
    canvas.replaceWith(nextCanvas); canvas = nextCanvas;
    try {
      renderer = await createPetRenderer(canvas);
      renderer.start(started);
      pet.dataset.state = 'ready'; begin.hidden = started;
      say(started ? '你敲键盘，我也一起！试试摸摸我。' : '点击「开始陪伴」，收起素材说明。');
      sync();
    } catch (error) {
      console.warn('[桌宠] 加载失败', error);
      pet.dataset.state = 'error'; retry.hidden = false;
      say('桌宠暂时没能加载，点下方按钮重试。');
    } finally { loading = false; }
  }
  function start() {
    if (!renderer) return;
    started = true; writeStored('pet-qiuyuan-started', 'true');
    renderer.start(true); begin.hidden = true;
    say('你好，我是仇远。今天也陪你一起学习！');
  }
  function clearInput() { renderer?.reset(); }
  function setHidden(hidden) {
    if (hidden) { clearInput(); clearTimeout(effectTimer); particles.replaceChildren(); }
    pet.hidden = hidden; restore.hidden = !hidden; writeStored('pet-hidden', hidden);
    if (!hidden) { place(position.x, position.y); void load(); character.focus(); }
    else restore.focus();
    sync();
  }
  const valid = position && Number.isFinite(position.x) && Number.isFinite(position.y);
  place(valid ? position.x : window.innerWidth - 264, valid ? position.y : window.innerHeight - 380);
  pet.hidden = readStored('pet-hidden', 'false') === 'true'; restore.hidden = !pet.hidden;
  const resize = () => { if (!pet.hidden) place(position.x, position.y); };
  window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { clearInput(); sync(); });
  window.addEventListener('blur', clearInput);
  motion.addEventListener('change', () => { clearInput(); particles.replaceChildren(); sync(); });
  pet.querySelector('[data-action="hide"]').addEventListener('click', () => setHidden(true));
  restore.addEventListener('click', () => setHidden(false));
  pause.addEventListener('click', () => {
    paused = !paused; writeStored('pet-paused', paused); clearInput(); sync();
    say(paused ? '我先安静待一会儿，点 ▷ 就回来。' : '休息好了，继续陪你！');
  });
  begin.addEventListener('click', start); retry.addEventListener('click', () => void load());
  pet.querySelector('.space-pet__credit').addEventListener('click', () => {
    if (!renderer) return;
    started = false; renderer.start(false); begin.hidden = false;
    writeStored('pet-qiuyuan-started', 'false'); say('这是素材附带的作者与版本说明。');
  });
  function interact(name) {
    if (!renderer) { say(loading ? '再等一下，马上就到！' : '请点「重新加载桌宠」试试。'); return; }
    if (!started) { start(); return; }
    if (paused) { say('我正在休息，点 ▷ 可以继续互动。'); return; }
    const reactions = { wink: '摸摸收到啦，送你一颗小心心 ♡', type: '哒哒哒，陪你一起敲键盘！', nod: '做得很好！再完成一个小目标吧 ✦' };
    renderer.react(name); say(reactions[name]);
    pet.dataset.reaction = name;
    clearTimeout(effectTimer); particles.replaceChildren();
    if (!motion.matches) {
      for (let i = 0; i < 7; i++) {
        const spark = document.createElement('span'); spark.textContent = name === 'wink' ? '♥' : '✦';
        spark.style.setProperty('--dx', `${(i - 3) * 26}px`);
        spark.style.setProperty('--dy', `${-45 - (i % 3) * 20}px`);
        particles.append(spark);
      }
    }
    effectTimer = setTimeout(() => { particles.replaceChildren(); delete pet.dataset.reaction; }, 1200);
  }
  pet.querySelectorAll('[data-reaction]').forEach(button => button.addEventListener('click', () => interact(button.dataset.reaction)));
  character.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return;
    suppressClick = false; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: { ...position }, moved: false };
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
    suppressClick = drag.moved || e.type === 'pointercancel'; drag = null;
    pet.classList.remove('is-dragging'); place(position.x, position.y, true);
    if (character.hasPointerCapture(e.pointerId)) character.releasePointerCapture(e.pointerId);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) character.addEventListener(type, endDrag);
  character.addEventListener('click', e => {
    if (suppressClick && e.detail !== 0) { suppressClick = false; return; }
    suppressClick = false; interact(['wink', 'type', 'nod'][sequence++ % 3]);
  });
  character.addEventListener('keydown', e => {
    const moves = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
    if (!moves[e.key]) return;
    e.preventDefault(); const [dx, dy] = moves[e.key]; place(position.x + dx, position.y + dy, true);
  });
  // Only page input is observed. Never collect field values or mirror password entry.
  const canReact = () => renderer && started && !paused && !pet.hidden && !document.hidden;
  document.addEventListener('keydown', e => {
    if (!canReact() || pet.contains(e.target) || e.target?.type === 'password' || e.isComposing) return;
    renderer.key(e.code, true);
  });
  document.addEventListener('keyup', e => renderer?.key(e.code, false));
  document.addEventListener('focusin', e => { if (e.target?.type === 'password') clearInput(); });
  function trackPointer(e) {
    if (!canReact() || drag) return;
    renderer.pointer(e.clientX / window.innerWidth * 2 - 1, 1 - e.clientY / window.innerHeight * 2,
      pet.contains(e.target) ? 0 : e.buttons);
  }
  for (const type of ['pointermove', 'pointerdown', 'pointerup']) document.addEventListener(type, trackPointer, { passive: true });
  document.addEventListener('pointercancel', clearInput);
  document.addEventListener('pointerleave', clearInput);
  sync(); if (!pet.hidden) void load();
}
