import { readStored, writeStored } from './util.js';

// Fixed companion. Asset provenance is documented in /pet/README.md.
export function initPet() {
  if (document.getElementById('space-pet') || typeof document.createElement('canvas').getContext !== 'function') return;
  const pet = document.createElement('aside');
  pet.id = 'space-pet'; pet.className = 'space-pet';
  pet.setAttribute('aria-label', '桌宠');
  pet.innerHTML = '<img class="space-pet__image" src="/pet/companion/wink.webp" alt="蓝发小伙伴" draggable="false">';
  const dock = document.createElement('div');
  dock.className = 'space-pet-dock';
  dock.innerHTML = `<button type="button" class="space-pet-toggle" aria-controls="space-pet">🐋</button>
    <button type="button" class="space-pet__retry" hidden>重新加载角色</button>`;
  document.body.append(pet, dock);
  const toggle = dock.querySelector('.space-pet-toggle'), retry = dock.querySelector('.space-pet__retry');
  const sprite = pet.querySelector('img');
  const sources = ['wink', 'cheer', 'wave'].map(name => `/pet/companion/${name}.webp`);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let pose = 0, timer;
  function sync() {
    toggle.setAttribute('aria-expanded', String(!pet.hidden));
    const label = pet.hidden ? '恢复桌宠' : '收起桌宠';
    toggle.setAttribute('aria-label', label); toggle.title = label;
    clearInterval(timer);
    if (!pet.hidden && !document.hidden && !motion.matches && pet.dataset.state === 'ready') {
      timer = setInterval(() => { pose = (pose + 1) % sources.length; sprite.src = sources[pose]; }, 5000);
    }
  }
  pet.hidden = readStored('pet-hidden', 'false') === 'true';
  toggle.addEventListener('click', () => {
    pet.hidden = !pet.hidden; writeStored('pet-hidden', pet.hidden); sync();
  });
  sprite.addEventListener('load', () => { pet.dataset.state = 'ready'; retry.hidden = true; sync(); });
  sprite.addEventListener('error', () => { pet.dataset.state = 'error'; retry.hidden = false; sync(); });
  retry.addEventListener('click', () => { pet.dataset.state = 'loading'; sprite.src = sources[pose]; });
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  if (sprite.complete && sprite.naturalWidth) pet.dataset.state = 'ready';
  sync();
}
