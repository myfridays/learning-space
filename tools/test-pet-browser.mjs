/** Real browser regression checks. Start npm run dev first; see public/pet/README.md. */
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const base = process.env.BASE_URL || 'http://127.0.0.1:8787';
const errors = [];
let passed = 0;
function check(name, result) { assert.ok(result, name); passed++; console.log(`✓ ${name}`); }
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.locator('#space-pet[data-state="ready"]').waitFor({ timeout: 60000 });
  check('Live2D loads with the original material notice', await page.locator('.space-pet__begin').isVisible());
  await page.locator('.space-pet__begin').click();
  check('Start button closes the original notice', !(await page.locator('.space-pet__begin').isVisible()));

  // Observe the actual model before Core updates it, without adding production test hooks.
  await page.evaluate(() => {
    window.petProbe = { updates: 0, parameters: {} };
    const proto = PIXI.live2d.Live2DModel.prototype;
    const original = proto.update;
    proto.update = function(dt) {
      if (!this.__testObserved) {
        this.__testObserved = true;
        this.internalModel.on('beforeModelUpdate', () => {
          const params = this.internalModel.coreModel._model.parameters;
          window.petProbe.updates++;
          window.petProbe.parameters = Object.fromEntries(params.ids.map((id, i) => [id, params.values[i]]));
        });
      }
      return original.call(this, dt);
    };
    const input = document.createElement('input'); input.id = 'pet-test-input';
    input.style = 'position:fixed;left:5px;top:5px;z-index:9999'; document.body.append(input);
  });
  await page.waitForFunction(() => window.petProbe.parameters.Paramshuiying === 1);
  const character = page.locator('.space-pet__character');
  for (const action of ['wink', 'type', 'nod']) {
    await page.locator(`[data-reaction="${action}"]`).click();
    check(`Interaction ${action}`, await page.locator('#space-pet').getAttribute('data-reaction') === action);
  }
  await page.waitForTimeout(1300);
  const input = page.locator('#pet-test-input'); await input.focus();
  await page.keyboard.down('a'); await page.keyboard.down('s');
  await page.waitForFunction(() => petProbe.parameters.A1 === 1 && petProbe.parameters.S1 === 1);
  check('Multiple held keys drive their model parameters', true);
  await page.keyboard.up('a');
  await page.waitForFunction(() => petProbe.parameters.A1 === 0 && petProbe.parameters.S1 === 1);
  check('Releasing one key preserves the other held key', true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => petProbe.parameters.S1 === 0 && petProbe.parameters.CatParamLeftHandDown === 0);
  await page.keyboard.up('s'); check('Blur releases all input', true);
  await input.evaluate(el => el.type = 'password'); await input.focus(); await page.keyboard.down('a');
  await page.waitForTimeout(150);
  check('Password entry does not animate key values', await page.evaluate(() => petProbe.parameters.A1 === 0));
  await page.keyboard.up('a'); await input.evaluate(el => el.type = 'text');
  await page.mouse.move(20, 400); await page.waitForTimeout(250);
  const left = await page.evaluate(() => petProbe.parameters.ParamMouseX);
  await page.mouse.move(1240, 400); await page.waitForTimeout(250);
  check('Mouse follows across the page', left < 0 && await page.evaluate(() => petProbe.parameters.ParamMouseX > 0));
  await page.mouse.down(); await page.waitForFunction(() => petProbe.parameters.ParamMouseLeftDown === 1);
  await page.mouse.up(); await page.waitForFunction(() => petProbe.parameters.ParamMouseLeftDown === 0);
  check('Mouse button press and release are reflected', true);

  await page.locator('[data-action="pause"]').click();
  const pausedUpdates = await page.evaluate(() => petProbe.updates);
  await page.waitForTimeout(180);
  check('Pause stops model updates', await page.evaluate(() => petProbe.updates) === pausedUpdates);
  await page.locator('[data-action="pause"]').click();
  await page.waitForFunction(count => petProbe.updates > count, pausedUpdates);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Media-query change events are delivered after the emulation command returns.
  await page.waitForTimeout(100);
  const reducedUpdates = await page.evaluate(() => petProbe.updates);
  await page.waitForTimeout(180);
  check('Reduced motion stops continuous model updates', await page.evaluate(() => petProbe.updates) === reducedUpdates);
  await input.focus(); await page.keyboard.down('a');
  check('Reduced motion still renders input states', await page.evaluate(() => petProbe.parameters.A1 === 1));
  await page.keyboard.up('a');
  check('Reduced motion releases input states', await page.evaluate(() => petProbe.parameters.A1 === 0));
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const before = await page.locator('#space-pet').boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + 100); await page.mouse.down();
  await page.mouse.move(430, 420, { steps: 8 }); await page.mouse.up();
  const after = await page.locator('#space-pet').boundingBox();
  check('Dragging moves without triggering an interaction', after.x < before.x - 100 && await page.locator('#space-pet').getAttribute('data-reaction') === null);
  await page.reload(); await page.locator('#space-pet[data-state="ready"]').waitFor({ timeout: 60000 });
  check('Position persists after reload', Math.abs((await page.locator('#space-pet').boundingBox()).x - after.x) < 2);
  await character.focus(); await page.keyboard.press('ArrowLeft');
  check('Keyboard can move the pet', (await page.locator('#space-pet').boundingBox()).x < after.x);
  await page.keyboard.press('Enter');
  check('Keyboard can trigger interaction', await page.locator('#space-pet').getAttribute('data-reaction') === 'wink');
  await page.locator('[data-action="pause"]').click();
  check('Pause preference updates', await page.locator('#space-pet').getAttribute('data-paused') === 'true');
  await page.reload(); await page.locator('#space-pet[data-state="ready"]').waitFor({ timeout: 60000 });
  check('Pause survives refresh', await page.locator('#space-pet').getAttribute('data-paused') === 'true');
  await page.locator('[data-action="pause"]').click();
  await page.locator('[data-action="hide"]').click(); await page.reload();
  await page.locator('.space-pet-restore').waitFor();
  check('Hidden pet does not load its runtime', await page.evaluate(() => !window.PIXI));
  await page.locator('.space-pet-restore').click(); await page.locator('#space-pet[data-state="ready"]').waitFor({ timeout: 60000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-reaction="wink"]').click();
  check('Reduced motion disables particles', await page.locator('.space-pet__particles span').count() === 0);
  await page.locator('.space-pet__credit').click(); await page.locator('.space-pet__begin').click();
  check('Material notice can be reopened and dismissed in reduced motion', !(await page.locator('.space-pet__begin').isVisible()));
  await page.setViewportSize({ width: 390, height: 844 }); await character.focus();
  for (let i = 0; i < 35; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 35; i++) await page.keyboard.press('ArrowDown');
  const mobile = await page.locator('#space-pet').boundingBox();
  check('Pet stays within mobile viewport and above bottom navigation', mobile.x + mobile.width <= 390 && mobile.y + mobile.height <= 754);
  const cdp = await page.context().newCDPSession(page);
  const touch = { x: mobile.x + mobile.width / 2, y: mobile.y + 90 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 240 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('Touch drag moves the pet', (await page.locator('#space-pet').boundingBox()).y < mobile.y - 50);
  await page.screenshot({ path: '/tmp/qiuyuan-mobile.png' });
  check('No page script errors', errors.length === 0);

  const fail = await browser.newPage();
  await fail.route('**/cat.moc3', route => route.abort());
  await fail.goto(base); await fail.locator('#space-pet[data-state="error"]').waitFor({ timeout: 60000 });
  check('Model failure keeps app content usable', await fail.locator('#app').innerText() !== '');
  check('Model failure offers retry', await fail.locator('.space-pet__retry').isVisible());
  await fail.unroute('**/cat.moc3'); await fail.locator('.space-pet__retry').click();
  await fail.locator('#space-pet[data-state="ready"]').waitFor({ timeout: 60000 });
  check('Retry recovers from a failed model request', true);
  await fail.close();
  console.log(`${passed} browser checks passed.`);
} finally { await browser.close(); }
