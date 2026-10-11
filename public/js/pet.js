import { readStored } from './util.js';

// Original uploaded assets and playback details: /pet/README.md.
export function initPet() {
  if (document.getElementById('space-pet') || typeof document.createElement('canvas').getContext !== 'function') return;
  const base = '/pet/maid/';
  const labels = { idle: '待机', jump: '跳跃', cute: '卖萌', wave: '招手' };
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pet = document.createElement('aside');
  pet.id = 'space-pet'; pet.className = 'space-pet'; pet.setAttribute('aria-label', '桌宠');
  pet.dataset.state = 'loading';
  pet.innerHTML = '<button type="button" class="space-pet__character"><img class="space-pet__image" alt="蓝发小伙伴" draggable="false"></button><span class="space-pet__status" role="status">加载中…</span>';
  const dock = document.createElement('div');
  dock.className = 'space-pet-dock';
  dock.innerHTML = `<button type="button" class="space-pet__retry" hidden>重新加载角色</button>`;
  document.body.append(pet, dock);
  const retry = dock.querySelector('.space-pet__retry');
  const character = pet.querySelector('button'), sprite = pet.querySelector('img');
  const status = pet.querySelector('.space-pet__status');
  function setState(state) {
    pet.dataset.state = state;
    pet.setAttribute('aria-busy', String(state === 'loading'));
    status.textContent = state === 'error' ? '加载失败，请重试' : state === 'loading' ? '加载中…' : '';
  }
  let activeSound;
  // 音效统一：所有动作共用 jump.mp3
  const jumpSound = new Audio('/pet/sounds/jump.mp3');
  jumpSound.preload = 'auto'; jumpSound.volume = 0.65;
  const sounds = { jump: jumpSound, cute: jumpSound, wave: jumpSound };
  function stopSound() {
    if (!activeSound) return;
    activeSound.pause(); activeSound.currentTime = 0; activeSound = null;
  }
  function playSound(name) {
    stopSound();
    if (readStored('pet-muted', 'false') === 'true' || pet.hidden || document.hidden) return;
    activeSound = sounds[name];
    // Call directly from the gesture; blocked/missing audio must not interrupt the pose.
    activeSound.play().catch(() => {});
  }
  pet.hidden = readStored('pet-hidden', 'false') === 'true';
  let manifest, pose = 'idle', version = 0, frameRequest = 0, blinkTimer = 0;
  const images = new Map();
  function preload(path) {
    if (!images.has(path)) {
      const img = new Image(); img.src = base + path;
      const promise = img.decode().then(() => img).catch(error => { images.delete(path); throw error; });
      images.set(path, promise);
    }
    return images.get(path);
  }
  function canAnimate() { return !pet.hidden && !document.hidden && !motion.matches; }
  function nextPose() {
    const order = manifest?.clickOrder || ['jump', 'cute', 'wave'];
    return order[(order.indexOf(pose) + 1) % order.length];
  }
  function sync() {
    pet.dataset.pose = pose;
    const hint = `当前${labels[pose]}，点击切换为${labels[nextPose()]}`;
    character.setAttribute('aria-label', hint); character.title = hint;
  }
  function cancel() {
    version++; cancelAnimationFrame(frameRequest); clearTimeout(blinkTimer);
    pet.dataset.playback = 'static';
    return version;
  }
  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (pose === 'idle' && canAnimate()) blinkTimer = setTimeout(() => show(true), 4000 + Math.random() * 2000);
  }
  async function show(animate = false) {
    const ticket = cancel(); sync();
    setState('loading'); retry.hidden = true;
    try {
      const action = manifest.actions[pose];
      const still = await preload(action.static);
      if (ticket !== version) return;
      // Decode before showing the new pose to avoid incomplete images.
      sprite.src = still.src;
      pet.dataset.hasImage = 'true';
      setState('ready');
      if (!animate || !canAnimate()) { scheduleBlink(); return; }
      const frames = await Promise.all(action.frames.map(preload));
      if (ticket !== version || !canAnimate()) return;
      pet.dataset.playback = 'playing';
      let started, previous = -1;
      function tick(now) {
        if (ticket !== version) return;
        started ??= now;
        const elapsed = now - started;
        if (elapsed >= action.durationMs) {
          sprite.src = still.src; pet.dataset.playback = 'static'; scheduleBlink(); return;
        }
        let index = 0, end = action.durationsMs[0];
        while (index < frames.length - 1 && elapsed >= end) end += action.durationsMs[++index];
        if (index !== previous) { sprite.src = frames[index].src; previous = index; }
        frameRequest = requestAnimationFrame(tick);
      }
      frameRequest = requestAnimationFrame(tick);
    } catch {
      if (ticket !== version) return;
      setState('error'); pet.dataset.playback = 'static'; retry.hidden = false;
    }
  }
  async function boot() {
    retry.hidden = true; setState('loading');
    try {
      const response = await fetch(base + 'manifest.json');
      if (!response.ok) throw new Error('Pet assets unavailable');
      manifest = await response.json();
      character.disabled = false;
      await show();
      // Warm the next action without blocking the initial still or surfacing optional preload errors.
      const next = manifest.actions[nextPose()];
      Promise.all([next.static, ...next.frames].map(preload)).catch(() => {});
    } catch { setState('error'); retry.hidden = false; }
  }
  character.disabled = true;
  character.addEventListener('click', () => { pose = nextPose(); playSound(pose); show(true); });
  window.addEventListener('pet-visibility-change', () => {
    pet.hidden = readStored('pet-hidden', 'false') === 'true'; sync();
    if (pet.hidden) stopSound();
    if (manifest) show();
  });
  retry.addEventListener('click', () => manifest ? show(true) : boot());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSound();
    if (manifest) show();
  });
  motion.addEventListener('change', () => { if (manifest) show(); });
  window.addEventListener('pet-sound-change', stopSound);
  sync(); boot();
}
