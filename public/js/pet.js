import { readStored, writeStored } from './util.js';

// Fixed, click-to-cycle animated companion. Asset provenance: /pet/README.md.
export function initPet() {
  if (document.getElementById('space-pet') || typeof document.createElement('canvas').getContext !== 'function') return;
  const poses = [ { file: 'wave', label: '招手' }, { file: 'jump', label: '跳跃' }, { file: 'blink', label: '眨眼' } ];
  let pose = 0;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pet = document.createElement('aside');
  pet.id = 'space-pet'; pet.className = 'space-pet'; pet.setAttribute('aria-label', '桌宠');
  pet.innerHTML = '<button type="button" class="space-pet__character"><img class="space-pet__image" alt="蓝发小伙伴" draggable="false"></button>';
  const dock = document.createElement('div');
  dock.className = 'space-pet-dock';
  dock.innerHTML = `<button type="button" class="space-pet-toggle" aria-controls="space-pet">🐋</button>
    <button type="button" class="space-pet__retry" hidden>重新加载角色</button>`;
  document.body.append(pet, dock);
  const toggle = dock.querySelector('.space-pet-toggle'), retry = dock.querySelector('.space-pet__retry');
  const character = pet.querySelector('button'), sprite = pet.querySelector('img');
  pet.hidden = readStored('pet-hidden', 'false') === 'true';
  function source() {
    const folder = pet.hidden || document.hidden || motion.matches ? 'still' : 'animated';
    return `/pet/companion/${folder}/${poses[pose].file}.webp`;
  }
  function sync() {
    toggle.setAttribute('aria-expanded', String(!pet.hidden));
    const label = pet.hidden ? '恢复桌宠' : '收起桌宠';
    toggle.setAttribute('aria-label', label); toggle.title = label;
    pet.dataset.pose = poses[pose].file;
    const hint = `当前${poses[pose].label}，点击切换为${poses[(pose + 1) % poses.length].label}`;
    character.setAttribute('aria-label', hint); character.title = hint;
    if (sprite.getAttribute('src') !== source()) {
      pet.dataset.state = 'loading'; retry.hidden = true; sprite.src = source();
    }
  }
  character.addEventListener('click', () => { pose = (pose + 1) % poses.length; sync(); });
  toggle.addEventListener('click', () => {
    pet.hidden = !pet.hidden; writeStored('pet-hidden', pet.hidden); sync();
  });
  sprite.addEventListener('load', () => { pet.dataset.state = 'ready'; retry.hidden = true; });
  sprite.addEventListener('error', () => { pet.dataset.state = 'error'; retry.hidden = false; });
  retry.addEventListener('click', () => { pet.dataset.state = 'loading'; sprite.src = source(); });
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  sync();
}
