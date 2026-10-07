// Browser implementation of BongoCat-style input-to-parameter animation.
// See public/pet/README.md for model provenance and runtime licenses.
let runtimePromise;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    const timer = setTimeout(() => { script.remove(); reject(new Error('桌宠组件加载超时')); }, 20000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('桌宠组件加载失败')); };
    document.head.append(script);
  });
}
function loadRuntime() {
  return runtimePromise ||= (async () => {
    if (!window.Live2DCubismCore) await loadScript('/vendor/live2d/live2dcubismcore.min.js');
    if (!window.PIXI) await loadScript('/vendor/live2d/pixi.min.js');
    if (!window.PIXI.live2d) await loadScript('/vendor/live2d/cubism4.min.js');
    return window.PIXI;
  })().catch(error => { runtimePromise = null; throw error; });
}

export const KEY_PARAMETERS = Object.freeze({
  Digit1: 'F0', Digit2: 'F2', Digit3: 'F3', Digit4: 'F4', Digit5: 'F5',
  KeyQ: 'Q1', KeyW: 'W1', KeyE: 'E1', KeyR: 'R1', KeyT: 'T1',
  KeyA: 'A1', KeyS: 'S1', KeyD: 'D1', KeyF: 'F1', KeyG: 'G1',
  KeyZ: 'Z1', KeyX: 'X1', KeyC: 'C1', KeyV: 'V1', KeyB: 'B1',
  Enter: 'Enter1', NumpadEnter: 'Enter1', Space: 'Space',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt',
});

export async function createPetRenderer(canvas) {
  const PIXI = await loadRuntime();
  const app = new PIXI.Application({
    view: canvas, width: 300, height: 300, backgroundAlpha: 0,
    resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
    antialias: true, autoStart: false,
  });
  let model;
  try {
    model = await PIXI.live2d.Live2DModel.from('/pet/qiuyuan/cat.model3.json', {
      autoInteract: false, autoUpdate: false, motionPreload: 'NONE',
    });
    // The original 8192px atlas is preserved on disk. Upload at most 2048px
    // to the GPU (16 MiB instead of 256 MiB) for this small desktop companion.
    const limit = Math.min(2048, app.renderer.gl.getParameter(app.renderer.gl.MAX_TEXTURE_SIZE));
    model.textures = model.textures.map(texture => {
      const source = texture.baseTexture.resource.source;
      if (Math.max(source.width, source.height) <= limit) return texture;
      const resized = document.createElement('canvas');
      const scale = limit / Math.max(source.width, source.height);
      resized.width = Math.round(source.width * scale); resized.height = Math.round(source.height * scale);
      const ctx = resized.getContext('2d');
      ctx.drawImage(source, 0, 0, resized.width, resized.height);
      const result = PIXI.Texture.from(resized);
      texture.destroy(true);
      return result;
    });
    model.scale.set(300 / Math.max(model.width, model.height));
    model.position.set((300 - model.width) / 2, (300 - model.height) / 2);
    app.stage.addChild(model);
  } catch (error) {
    model?.destroy({ children: true, texture: true, baseTexture: true });
    app.destroy(false);
    throw error;
  }
  const internal = model.internalModel;
  const core = internal.coreModel;
  const ids = new Set(core._model.parameters.ids);
  const pressed = new Set();
  let mouseButtons = 0, target = { x: 0, y: 0 }, look = { x: 0, y: 0 };
  let active = false, reduced = false, frame = 0, last = 0, now = 0;
  let action = '', actionUntil = 0, started = false;
  function set(id, value) { if (ids.has(id)) core.setParameterValueById(id, value); }
  internal.on('beforeModelUpdate', () => {
    if (reduced) {
      set('ParamEyeLOpen', 1); set('ParamEyeROpen', 1); set('ParamBreath', .5);
      set('ParamAngleX', 0); set('ParamAngleY', 0); set('ParamAngleZ', 0);
      set('ParamEyeBallX', 0); set('ParamEyeBallY', 0);
    }
    for (const id of new Set(Object.values(KEY_PARAMETERS))) set(id, 0);
    for (const code of pressed) set(KEY_PARAMETERS[code], 1);
    set('CatParamLeftHandDown', pressed.size || (action === 'type' && Math.sin(now / 75) > 0) ? 1 : 0);
    set('ParamMouseLeftDown', mouseButtons & 1 ? 1 : 0);
    set('ParamMouseRightDown', mouseButtons & 2 ? 1 : 0);
    set('ParamMouseX', look.x * 30); set('ParamMouseY', look.y * 30);
    // Match the model's documented Alt+1 action, only after the user starts it.
    set('Paramshuiying', started ? 1 : 0);
    if (!reduced && action === 'wink') { set('ParamEyeLOpen', 0); set('ParamMouthOpenY', .35); }
    if (!reduced && action === 'nod') set('ParamAngleY', Math.sin(now / 120) * 18);
  });
  function render(dt = 0) {
    now = performance.now();
    if (now >= actionUntil) action = '';
    look.x += (target.x - look.x) * .18; look.y += (target.y - look.y) * .18;
    internal.focusController.focus(reduced ? 0 : look.x, reduced ? 0 : look.y, true);
    // Pixi's Live2D adapter skips parameter evaluation when deltaTime is zero.
    // A tiny step applies input even when continuous animation is disabled.
    model.update(Math.max(dt, .01));
    app.renderer.render(app.stage);
  }
  function tick(time) {
    if (!active || reduced) return;
    if (!last || time - last >= 1000 / 30) {
      render(last ? Math.min(time - last, 50) : 0); last = time;
    }
    frame = requestAnimationFrame(tick);
  }
  render();
  return {
    setActive(value, reduce = reduced) {
      active = value; reduced = reduce; cancelAnimationFrame(frame); last = 0;
      if (active) { render(); if (!reduced) frame = requestAnimationFrame(tick); }
    },
    start(value = true) { started = value; render(); },
    key(code, down) {
      if (down) pressed.add(code); else pressed.delete(code);
      if (active && reduced) render();
    },
    pointer(x, y, buttons = mouseButtons) {
      target = { x: reduced ? 0 : Math.max(-1, Math.min(1, x)), y: reduced ? 0 : Math.max(-1, Math.min(1, y)) };
      mouseButtons = buttons;
      if (active && reduced) render();
    },
    react(name) {
      if (reduced) return;
      action = name; actionUntil = performance.now() + 1100; if (active) render();
    },
    reset() { pressed.clear(); mouseButtons = 0; target = { x: 0, y: 0 }; action = ''; if (active) render(); },
    destroy() {
      active = false; cancelAnimationFrame(frame);
      model.destroy({ children: true, texture: true, baseTexture: true }); app.destroy(false);
    },
  };
}
