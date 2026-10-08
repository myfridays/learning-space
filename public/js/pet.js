import { readStored, writeStored } from './util.js';

// Original uploaded assets and playback details: /pet/README.md.
export function initPet() {
  if (document.getElementById('space-pet') || typeof document.createElement('canvas').getContext !== 'function') return;
  const base = '/pet/maid/';
  const labels = { idle: '待机', jump: '跳跃', cute: '卖萌', wave: '招手' };
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pet = document.createElement('aside');
  pet.id = 'space-pet'; pet.className = 'space-pet'; pet.setAttribute('aria-label', '桌宠');
  pet.innerHTML = '<button type="button" class="space-pet__character"><img class="space-pet__image" alt="蓝发小伙伴" draggable="false"></button>';
  const dock = document.createElement('div');
  dock.className = 'space-pet-dock';
  dock.innerHTML = `<button type="button" class="space-pet-toggle" aria-controls="space-pet">🐋</button>
    <button type="button" class="space-pet-sound" aria-label="桌宠静音"></button>
    <button type="button" class="space-pet__retry" hidden>重新加载角色</button>`;
  document.body.append(pet, dock);
  const toggle = dock.querySelector('.space-pet-toggle'), retry = dock.querySelector('.space-pet__retry');
  const character = pet.querySelector('button'), sprite = pet.querySelector('img');
  const soundToggle = dock.querySelector('.space-pet-sound');
  let muted = readStored('pet-muted', 'false') === 'true', activeSound;
  const sounds = Object.fromEntries(['jump', 'cute', 'wave'].map(name => {
    const audio = new Audio(`/pet/sounds/${name}.mp3`);
    audio.preload = 'auto'; audio.volume = 0.65;
    return [name, audio];
  }));
  function stopSound() {
    if (!activeSound) return;
    activeSound.pause(); activeSound.currentTime = 0; activeSound = null;
  }
  function playSound(name) {
    stopSound();
    if (muted || pet.hidden || document.hidden) return;
    activeSound = sounds[name];
    // Call directly from the gesture; blocked/missing audio must not interrupt the pose.
    activeSound.play().catch(() => {});
  }
  function syncSound() {
    soundToggle.textContent = muted ? '🔇' : '🔊';
    soundToggle.setAttribute('aria-pressed', String(muted));
    soundToggle.title = muted ? '开启桌宠音效' : '关闭桌宠音效';
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
    toggle.setAttribute('aria-expanded', String(!pet.hidden));
    const label = pet.hidden ? '恢复桌宠' : '收起桌宠';
    toggle.setAttribute('aria-label', label); toggle.title = label;
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
    pet.dataset.state = 'loading'; retry.hidden = true;
    try {
      const action = manifest.actions[pose];
      const still = await preload(action.static);
      if (ticket !== version) return;
      // Keep the previous decoded image visible until the new pose is ready.
      sprite.src = still.src;
      pet.dataset.state = 'ready';
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
      pet.dataset.state = 'error'; pet.dataset.playback = 'static'; retry.hidden = false;
    }
  }
  async function boot() {
    retry.hidden = true; pet.dataset.state = 'loading';
    try {
      const response = await fetch(base + 'manifest.json');
      if (!response.ok) throw new Error('Pet assets unavailable');
      manifest = await response.json();
      character.disabled = false;
      await show();
      // Warm the next action without blocking the initial still or surfacing optional preload errors.
      const next = manifest.actions[nextPose()];
      Promise.all([next.static, ...next.frames].map(preload)).catch(() => {});
    } catch { pet.dataset.state = 'error'; retry.hidden = false; }
  }
  character.disabled = true;
  character.addEventListener('click', () => { pose = nextPose(); playSound(pose); show(true); });
  soundToggle.addEventListener('click', () => {
    muted = !muted; writeStored('pet-muted', muted); stopSound(); syncSound();
  });
  toggle.addEventListener('click', () => {
    pet.hidden = !pet.hidden; writeStored('pet-hidden', pet.hidden); sync();
    if (pet.hidden) stopSound();
    if (manifest) show();
  });
  retry.addEventListener('click', () => manifest ? show(true) : boot());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSound();
    if (manifest) show();
  });
  motion.addEventListener('change', () => { if (manifest) show(); });
  syncSound(); sync(); boot();
}
